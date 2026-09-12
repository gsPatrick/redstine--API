"use strict";

const db = require("../../models");
const { AppError } = require("../../utils/app-error");
const { gerarReferencia } = require("../../utils/reference");
const { parsePagination } = require("../../utils/pagination");
const payoutsService = require("../payouts/payouts.service");
const mailer = require("../../providers/mailer");
const audit = require("../audit/audit.service");
const eventos = require("../events/events.service");
const notificacoes = require("../notifications/notifications.service");
const {
  ORDER_STATUS,
  ASSET_STATUS,
  MODALIDADES,
  PAYMENT_STATUS,
  PICKUP_STATUS,
  CANAIS_VENDA,
} = require("../../config/constants");

const INCLUDES = () => [
  {
    model: db.OrderItem,
    as: "itens",
    include: [{ model: db.Asset, as: "ativo", attributes: ["id", "slug", "name", "status"] }],
  },
  { model: db.User, as: "comprador", attributes: ["id", "name", "email"] },
  {
    model: db.Cost,
    as: "custos",
    attributes: ["id", "type", "description", "amount", "approvedAt"],
  },
  {
    model: db.Payout,
    as: "repasses",
    attributes: [
      "id", "supplierPercent", "redPercent",
      "grossAmount", "approvedCosts", "netAmount",
      "supplierAmount", "redAmount", "status", "dueAt", "paidAt",
    ],
  },
];

/**
 * Cria um pedido de compra direta.
 *
 * Duas regras do negocio moldam este service:
 *  1. "O envio de interesse nao caracteriza reserva automatica" — o pedido
 *     nasce em AGUARDANDO_CONFIRMACAO e NAO baixa quantidade.
 *  2. Ativos "sob consulta" nao entram em pedido: viram cotacao.
 *
 * `externo` afrouxa exatamente DUAS coisas, e so para a venda registrada pela
 * RED (revisao do cliente, item 11):
 *
 *  - o preco pode vir na linha. Numa venda por WhatsApp o valor foi negociado
 *    ao telefone e nao e necessariamente o do catalogo; forcar o preco
 *    publicado faria o operador editar o ativo so para poder registrar a
 *    venda, e isso reescreveria o catalogo por causa de um caso pontual.
 *  - o ativo "sob consulta" entra no pedido, desde que COM preco. E o caso
 *    tipico: sob consulta significa que o preco se fecha no atendimento, e o
 *    atendimento acabou de acontecer. Sem preco continua recusado.
 *
 * Nada mais muda: mesmo estoque, mesma confirmacao, mesmo repasse. Quem esta
 * de fora e o checkout do site, onde `externo` e sempre falso.
 */
async function criar(dados, { atorId = null, externo = false } = {}) {
  return db.sequelize.transaction(async (t) => {
    const ids = dados.items.map((i) => i.assetId);

    const ativos = await db.Asset.findAll({
      where: { id: ids, status: ASSET_STATUS.PUBLICADO },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (ativos.length !== ids.length) {
      const encontrados = new Set(ativos.map((a) => a.id));
      throw AppError.unprocessable(
        "Um ou mais ativos nao estao disponiveis.",
        "ASSET_UNAVAILABLE",
        { indisponiveis: ids.filter((id) => !encontrados.has(id)) }
      );
    }

    const porId = new Map(ativos.map((a) => [a.id, a]));
    const itens = [];
    let subtotal = 0;

    for (const linha of dados.items) {
      const ativo = porId.get(linha.assetId);

      // Preco combinado na linha: so a venda externa pode informa-lo, e e ele
      // que libera o ativo sob consulta.
      const precoInformado = externo && Number(linha.unitPrice) > 0
        ? Number(Number(linha.unitPrice).toFixed(2))
        : null;

      if (ativo.saleMode === MODALIDADES.CONSULTA && precoInformado === null) {
        throw AppError.unprocessable(
          `"${ativo.name}" e sob consulta e nao pode ser comprado diretamente.`,
          "QUOTE_REQUIRED",
          { assetId: ativo.id }
        );
      }

      if (precoInformado === null && (ativo.price === null || Number(ativo.price) <= 0)) {
        throw AppError.unprocessable(
          `"${ativo.name}" nao possui preco definido.`,
          "PRICE_MISSING",
          { assetId: ativo.id }
        );
      }

      if (linha.quantity > ativo.quantity) {
        throw AppError.unprocessable(
          `Quantidade indisponivel para "${ativo.name}".`,
          "INSUFFICIENT_QUANTITY",
          { assetId: ativo.id, disponivel: ativo.quantity, pedido: linha.quantity }
        );
      }

      const unit = precoInformado === null ? Number(ativo.price) : precoInformado;
      const total = Number((unit * linha.quantity).toFixed(2));
      subtotal += total;

      itens.push({
        assetId: ativo.id,
        nameSnapshot: ativo.name,
        unitPrice: unit,
        marketPriceSnapshot: ativo.marketPrice,
        quantity: linha.quantity,
        total,
      });
    }

    subtotal = Number(subtotal.toFixed(2));

    const order = await db.Order.create(
      {
        reference: gerarReferencia("RED"),
        buyerId: dados.buyerId || atorId,
        buyerName: dados.buyerName,
        buyerEmail: dados.buyerEmail,
        buyerPhone: dados.buyerPhone,
        buyerDocument: dados.buyerDocument,
        billing: dados.billing || {},
        paymentMethod: dados.paymentMethod,
        // Procedencia: `site` por omissao, porque o checkout nao informa canal.
        channel: dados.channel || CANAIS_VENDA.SITE,
        registeredById: externo ? atorId : null,
        notes: dados.notes,
        subtotal,
        // Retirada e transporte sao confirmados a parte — nao ha frete no total.
        total: subtotal,
        status: ORDER_STATUS.AGUARDANDO_CONFIRMACAO,
      },
      { transaction: t }
    );

    await db.OrderItem.bulkCreate(
      itens.map((i) => ({ ...i, orderId: order.id })),
      { transaction: t }
    );

    mailer.pedidoRecebido(order).catch(() => {});

    await audit.registrar(
      {
        entity: "order",
        entityId: order.id,
        action: "cadastro",
        depois: {
          status: order.status,
          total: order.total,
          reference: order.reference,
          channel: order.channel,
        },
        ator: atorId ? { id: atorId } : null,
      },
      { transaction: t }
    );

    return order;
  });
}

/**
 * Confirmacao pela RED. So aqui a quantidade e baixada — antes disso o ativo
 * continua disponivel para outros compradores, como a regra manda.
 */
async function confirmar(id) {
  return db.sequelize.transaction(async (t) => {
    const order = await db.Order.findByPk(id, {
      include: [{ model: db.OrderItem, as: "itens" }],
      transaction: t,
    });
    if (!order) throw AppError.notFound("Pedido nao encontrado.", "ORDER_NOT_FOUND");

    if (order.status !== ORDER_STATUS.AGUARDANDO_CONFIRMACAO) {
      throw AppError.unprocessable(
        "Pedido nao esta aguardando confirmacao.",
        "INVALID_ORDER_STATUS",
        { status: order.status }
      );
    }

    for (const item of order.itens) {
      const ativo = await db.Asset.findByPk(item.assetId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!ativo || ativo.status !== ASSET_STATUS.PUBLICADO) {
        throw AppError.unprocessable(
          `"${item.nameSnapshot}" deixou de estar disponivel.`,
          "ASSET_UNAVAILABLE",
          { assetId: item.assetId }
        );
      }
      if (item.quantity > ativo.quantity) {
        throw AppError.unprocessable(
          `Quantidade insuficiente para "${item.nameSnapshot}".`,
          "INSUFFICIENT_QUANTITY",
          { assetId: item.assetId, disponivel: ativo.quantity }
        );
      }

      const restante = ativo.quantity - item.quantity;
      await ativo.update(
        {
          quantity: restante,
          ...(restante === 0
            ? { status: ASSET_STATUS.VENDIDO, soldAt: new Date() }
            : {}),
        },
        { transaction: t }
      );
    }

    await order.update(
      { status: ORDER_STATUS.CONFIRMADO, confirmedAt: new Date() },
      { transaction: t }
    );

    // O repasse nasce junto da venda, na mesma transacao: se algo falhar aqui,
    // a confirmacao inteira volta atras e nao fica venda sem repasse.
    await payoutsService.gerarParaPedido(order, order.itens, { transaction: t });

    mailer.pedidoConfirmado(order).catch(() => {});

    await audit.registrar(
      {
        entity: "order",
        entityId: order.id,
        action: "confirmacao",
        antes: { status: ORDER_STATUS.AGUARDANDO_CONFIRMACAO },
        depois: { status: ORDER_STATUS.CONFIRMADO },
      },
      { transaction: t }
    );

    notificacoes.notificar(
      order.buyerId,
      notificacoes.TIPOS.COMPRA_CONFIRMADA,
      { reference: order.reference, entity: "order", entityId: order.id },
      { email: true }
    );
    notificacoes.notificarEquipe(
      notificacoes.GESTAO_COMERCIAL,
      notificacoes.TIPOS.VENDA_REALIZADA,
      { reference: order.reference, entity: "order", entityId: order.id }
    );

    return order;
  });
}

/**
 * Venda fechada FORA do site (revisao do cliente, item 11).
 *
 * "Forma de registro de vendas fora do site no sistema."
 *
 * A RED fecha negocio por WhatsApp e por telefone. Enquanto essas vendas nao
 * existiam no sistema, tres coisas ficavam erradas ao mesmo tempo: o estoque
 * mentia (o ativo continuava a aparecer disponivel no site depois de vendido),
 * o fornecedor nao tinha repasse gerado, e os numeros da gestao mostravam
 * menos do que a RED realmente vendeu.
 *
 * A decisao de projeto e a mais importante daqui: NAO existe entidade nova.
 * A venda externa e um Order comum, com `channel` a dizer de onde veio. Por
 * isso ela herda, de graca e sem duplicacao, tudo o que ja estava feito e
 * testado — a baixa de estoque, a regra financeira-mestre, o prazo de repasse,
 * a conclusao integral, a auditoria e as telas de pedido. Um "registro de
 * venda externa" com tabela propria teria de reimplementar cada uma dessas
 * regras, e a primeira a divergir seria a do dinheiro.
 *
 * O fluxo e criar + confirmar, nesta ordem e usando os MESMOS services:
 *
 *  - `criar` valida disponibilidade, quantidade e preco.
 *  - `confirmar` e o que baixa a quantidade de verdade e gera o repasse. Nao
 *    ha atalho aqui: se a venda externa gravasse o pedido como confirmado por
 *    conta propria, o estoque nao baixava e o repasse nao nascia — exatamente
 *    os dois defeitos que este item existe para corrigir.
 *
 * Sobre o SNAPSHOT do percentual: ele e gravado por `payouts.gerarParaPedido`
 * no momento desta confirmacao, com a tabela de percentuais vigente HOJE. Uma
 * venda antiga registrada com atraso entra com o percentual de hoje, e isso e
 * consciente: a alternativa seria reconstruir a tabela de percentuais numa data
 * passada, que o sistema nao versiona. O que nunca acontece e o inverso —
 * mudar a tabela amanha nao move este repasse nem nenhum outro.
 *
 * Pagamento e retirada sao OPCIONAIS: a venda por telefone costuma chegar ao
 * sistema ja paga e ja retirada, e obrigar o operador a repetir os mesmos dois
 * passos noutra tela levaria a vendas registadas e nunca concluidas — ou seja,
 * repasse que nunca e liberado.
 */
async function registrarVendaExterna(dados, { atorId = null, ator = null } = {}) {
  if (!dados.channel || dados.channel === CANAIS_VENDA.SITE) {
    // Um registro manual marcado como `site` seria indistinguivel do checkout
    // e tornaria a coluna de procedencia inutil justamente onde ela importa.
    throw AppError.badRequest(
      "Informe o canal em que a venda foi fechada.",
      "CHANNEL_REQUIRED",
      { canais: Object.values(CANAIS_VENDA).filter((c) => c !== CANAIS_VENDA.SITE) }
    );
  }

  const criado = await criar(dados, { atorId, externo: true });

  // A confirmacao e o passo que torna a venda real. Se ela falhar, o pedido
  // fica visivel na lista como "aguardando confirmacao" em vez de desaparecer:
  // o operador ve o que aconteceu e confirma a mao, sem redigitar a venda.
  await confirmar(criado.id);

  if (dados.paymentStatus) {
    await registrarPagamento(criado.id, {
      status: dados.paymentStatus,
      reference: dados.paymentReference,
      ator,
    });
  }

  if (dados.pickupStatus) {
    await registrarRetirada(criado.id, {
      status: dados.pickupStatus,
      local: dados.pickupLocation,
      notes: dados.pickupNotes,
      ator,
    });
  }

  await audit.registrar({
    entity: "order",
    entityId: criado.id,
    action: "registro_venda_externa",
    depois: { channel: dados.channel, total: criado.total, reference: criado.reference },
    ator,
    notes: dados.notes,
  });

  return porId(criado.id);
}

/**
 * Conclusao integral da operacao (documento oficial, secao 15).
 *
 * Cinco condicoes, todas obrigatorias:
 *   venda confirmada + pagamento do comprador confirmado + retirada concluida
 *   + nenhuma pendencia operacional + nenhum estorno em aberto
 *
 * So depois disto o valor do fornecedor deixa de ser "venda realizada" e passa
 * a "a receber", com prazo de 48h para o repasse.
 */
function condicoesDaConclusao(order) {
  return [
    {
      chave: "venda_confirmada",
      ok: order.status !== ORDER_STATUS.AGUARDANDO_CONFIRMACAO &&
          order.status !== ORDER_STATUS.CANCELADO,
    },
    { chave: "pagamento_confirmado", ok: order.paymentStatus === PAYMENT_STATUS.PAGO },
    {
      chave: "retirada_concluida",
      ok:
        order.pickupStatus === PICKUP_STATUS.CONCLUIDA ||
        order.pickupStatus === PICKUP_STATUS.NAO_APLICAVEL,
    },
    { chave: "sem_pendencia", ok: order.hasOpenIssue === false },
    { chave: "sem_estorno", ok: order.paymentStatus !== PAYMENT_STATUS.ESTORNADO },
  ];
}

/** Registra pagamento do comprador. E uma das condicoes da conclusao. */
async function registrarPagamento(id, { status, reference, ator } = {}) {
  const order = await db.Order.findByPk(id);
  if (!order) throw AppError.notFound("Pedido nao encontrado.", "ORDER_NOT_FOUND");

  const antes = order.paymentStatus;

  await order.update({
    paymentStatus: status,
    paymentConfirmedAt: status === PAYMENT_STATUS.PAGO ? new Date() : null,
    ...(reference ? { billing: { ...order.billing, paymentReference: reference } } : {}),
  });

  await audit.registrar({
    entity: "order",
    entityId: order.id,
    action: "pagamento",
    antes: { paymentStatus: antes },
    depois: { paymentStatus: status },
    ator,
  });

  if (status === PAYMENT_STATUS.PAGO) {
    eventos.registrar(eventos.EVENTOS.PAYMENT_COMPLETED, {
      orderId: order.id,
      userId: order.buyerId,
      payload: { total: order.total },
    });
  }

  return porId(order.id);
}

/** Registra a etapa de retirada/entrega. */
async function registrarRetirada(
  id,
  { status, notes, local, endereco, responsavel, contato, agendamento, instrucoes, ator } = {}
) {
  const order = await db.Order.findByPk(id);
  if (!order) throw AppError.notFound("Pedido nao encontrado.", "ORDER_NOT_FOUND");

  const antes = order.pickupStatus;

  await order.update({
    pickupStatus: status,
    pickupCompletedAt: status === PICKUP_STATUS.CONCLUIDA ? new Date() : null,
    // So sobrescreve o que veio: agendar uma retirada nao pode apagar o
    // endereco combinado numa chamada anterior.
    ...(notes !== undefined ? { pickupNotes: notes } : {}),
    ...(local !== undefined ? { pickupLocation: local } : {}),
    ...(endereco !== undefined ? { pickupAddress: endereco } : {}),
    ...(responsavel !== undefined ? { pickupContactName: responsavel } : {}),
    ...(contato !== undefined ? { pickupContactPhone: contato } : {}),
    ...(agendamento !== undefined ? { pickupScheduledAt: agendamento } : {}),
    ...(instrucoes !== undefined ? { pickupInstructions: instrucoes } : {}),
  });

  await audit.registrar({
    entity: "order",
    entityId: order.id,
    action: "retirada",
    antes: { pickupStatus: antes },
    depois: { pickupStatus: status },
    ator,
  });

  if (status === PICKUP_STATUS.AGENDADA || status === PICKUP_STATUS.AGUARDANDO) {
    notificacoes.notificar(
      order.buyerId,
      notificacoes.TIPOS.COMPRA_PRONTA_RETIRADA,
      { reference: order.reference, entity: "order", entityId: order.id },
      { email: true }
    );
  }

  return porId(order.id);
}

/** Diz o que ainda falta para a operacao poder ser concluida. */
async function pendenciasDaConclusao(id) {
  const order = await db.Order.findByPk(id);
  if (!order) throw AppError.notFound("Pedido nao encontrado.", "ORDER_NOT_FOUND");

  const condicoes = condicoesDaConclusao(order);
  return {
    concluida: Boolean(order.operationCompletedAt),
    pode: condicoes.every((c) => c.ok),
    condicoes,
    pendentes: condicoes.filter((c) => !c.ok).map((c) => c.chave),
  };
}

/**
 * Fecha a operacao e libera o repasse. E a unica porta para "a receber" —
 * nenhum outro caminho promove um Payout.
 */
async function concluirOperacao(id, { ator } = {}) {
  return db.sequelize.transaction(async (t) => {
    const order = await db.Order.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!order) throw AppError.notFound("Pedido nao encontrado.", "ORDER_NOT_FOUND");

    if (order.operationCompletedAt) {
      throw AppError.unprocessable(
        "Operacao ja concluida.",
        "OPERATION_ALREADY_COMPLETED",
        { concluidaEm: order.operationCompletedAt }
      );
    }

    const condicoes = condicoesDaConclusao(order);
    const pendentes = condicoes.filter((c) => !c.ok).map((c) => c.chave);

    if (pendentes.length) {
      throw AppError.unprocessable(
        "A operacao ainda nao esta integralmente concluida.",
        "OPERATION_NOT_COMPLETE",
        { pendentes }
      );
    }

    const agora = new Date();
    await order.update(
      { operationCompletedAt: agora, status: ORDER_STATUS.CONCLUIDO, concludedAt: agora },
      { transaction: t }
    );

    const repasse = await payoutsService.marcarOperacaoConcluida(order.id, { transaction: t });

    await audit.registrar(
      {
        entity: "order",
        entityId: order.id,
        action: "conclusao_operacao",
        depois: { operationCompletedAt: agora, repassesLiberados: repasse.atualizados },
        ator,
      },
      { transaction: t }
    );

    eventos.registrar(
      eventos.EVENTOS.OPERATION_COMPLETED,
      { orderId: order.id, userId: order.buyerId, payload: { total: order.total } },
      { transaction: t }
    );
    eventos.registrar(
      eventos.EVENTOS.PURCHASE_COMPLETED,
      { orderId: order.id, userId: order.buyerId },
      { transaction: t }
    );

    // Avisa cada fornecedor que tem valor liberado.
    const repasses = await db.Payout.findAll({ where: { orderId: order.id }, transaction: t });
    for (const r of repasses) {
      if (!r.supplierId) continue;
      notificacoes.notificar(
        r.supplierId,
        notificacoes.TIPOS.VALOR_A_RECEBER,
        { amount: r.supplierAmount, entity: "payout", entityId: r.id },
        { email: true }
      );
    }
    notificacoes.notificarEquipe(
      notificacoes.GESTAO_FINANCEIRA,
      notificacoes.TIPOS.REPASSE_PENDENTE,
      { amount: order.total, entity: "order", entityId: order.id }
    );

    return { order: await porId(order.id), repasse };
  });
}

async function mudarStatus(id, status, { motivo } = {}) {
  const order = await db.Order.findByPk(id);
  if (!order) throw AppError.notFound("Pedido nao encontrado.", "ORDER_NOT_FOUND");

  if (status === ORDER_STATUS.CONFIRMADO) {
    throw AppError.badRequest(
      "Use POST /orders/:id/confirm — a confirmacao baixa estoque.",
      "USE_CONFIRM_ENDPOINT"
    );
  }

  const patch = { status };
  if (status === ORDER_STATUS.CONCLUIDO) patch.concludedAt = new Date();
  if (status === ORDER_STATUS.CANCELADO) {
    patch.canceledAt = new Date();
    patch.cancelReason = motivo;
  }

  return db.sequelize.transaction(async (t) => {
    await order.update(patch, { transaction: t });

    // Cancelar o pedido cancela os repasses pendentes dele.
    if (status === ORDER_STATUS.CANCELADO) {
      await payoutsService.cancelarDoPedido(order.id, { transaction: t });
    }

    return order;
  });
}

async function listar(query) {
  const { page, perPage, limit, offset } = parsePagination(query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.buyerId) where.buyerId = query.buyerId;
  if (query.channel) where.channel = query.channel;

  const resultado = await db.Order.findAndCountAll({
    where,
    include: INCLUDES(),
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  return { ...resultado, page, perPage };
}

async function porId(id) {
  const order = await db.Order.findByPk(id, { include: INCLUDES() });
  if (!order) throw AppError.notFound("Pedido nao encontrado.", "ORDER_NOT_FOUND");
  return order;
}

async function porReferencia(reference) {
  const order = await db.Order.findOne({ where: { reference }, include: INCLUDES() });
  if (!order) throw AppError.notFound("Pedido nao encontrado.", "ORDER_NOT_FOUND");
  return order;
}

module.exports = {
  criar,
  confirmar,
  registrarVendaExterna,
  mudarStatus,
  listar,
  porId,
  porReferencia,
  registrarPagamento,
  registrarRetirada,
  pendenciasDaConclusao,
  concluirOperacao,
  condicoesDaConclusao,
};
