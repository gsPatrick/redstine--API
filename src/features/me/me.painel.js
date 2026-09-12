"use strict";

const { Op, fn, col, literal } = require("sequelize");
const db = require("../../models");
const { AppError } = require("../../utils/app-error");
const { parsePagination } = require("../../utils/pagination");
const payoutsService = require("../payouts/payouts.service");
const {
  ASSET_STATUS,
  ORDER_STATUS,
  QUOTE_STATUS,
  PICKUP_STATUS,
  PAYOUT_STATUS,
  MODELOS_COMERCIAIS,
  ROTULO_MODELO_COMERCIAL,
  ROTULO_CONDICAO,
  ROTULO_FORMA_VENDA,
  ROTULO_DISPONIBILIDADE,
  CAMPOS_TECNICOS,
} = require("../../config/constants");

/**
 * Leituras da Area do Cliente.
 *
 * Cada funcao aqui existe porque uma tela concreta a consome. O principio: a
 * API entrega a linha PRONTA para a tabela — o front nao junta pedido com item
 * com ativo com repasse para descobrir o que mostrar numa celula. Derivacao de
 * status, calculo de participacao e nome do ativo saem daqui.
 *
 * Tudo e escopado ao utilizador do token. O documento e explicito: o
 * isolamento acontece no backend, nao em filtro visual.
 */

const cent = (n) => Number(Number(n || 0).toFixed(2));

/**
 * Rotulo do modelo comercial. Reexportado do vocabulario em vez de redeclarado:
 * tres arquivos da gestao importam este mapa daqui, e enquanto ele era uma
 * copia local um modelo novo aparecia sem nome em todos eles.
 */
const NOME_MODELO = ROTULO_MODELO_COMERCIAL;

const ROTULO_ASSET = {
  [ASSET_STATUS.RASCUNHO]: "Rascunho",
  [ASSET_STATUS.EM_AVALIACAO]: "Em avaliação",
  [ASSET_STATUS.AGUARDANDO_APROVACAO]: "Aguardando aprovação",
  [ASSET_STATUS.APROVADO]: "Aprovado",
  [ASSET_STATUS.PUBLICADO]: "Publicado",
  [ASSET_STATUS.VENDIDO]: "Vendido",
  [ASSET_STATUS.INATIVO]: "Inativo",
};

const ROTULO_PAYOUT = {
  [PAYOUT_STATUS.VENDA_REALIZADA]: "Venda realizada",
  [PAYOUT_STATUS.A_RECEBER]: "A receber",
  [PAYOUT_STATUS.PAGAMENTO_PROGRAMADO]: "Pagamento programado",
  [PAYOUT_STATUS.PAGO]: "Pago",
  [PAYOUT_STATUS.CANCELADO]: "Cancelado",
};

/**
 * Status operacional da compra, como o comprador o entende.
 *
 * O banco guarda tres eixos independentes (status do pedido, do pagamento e da
 * retirada) porque eles mudam em momentos diferentes. A tela mostra UM estado.
 * Traduzir aqui evita que cada tela invente a sua propria combinacao — e que
 * duas telas discordem sobre a mesma compra.
 */
function statusDaCompra(order) {
  if (order.status === ORDER_STATUS.CANCELADO) return "Cancelado";
  if (order.operationCompletedAt) return "Concluído";
  if (order.pickupStatus === PICKUP_STATUS.CONCLUIDA) return "Retirado";
  if (order.pickupStatus === PICKUP_STATUS.AGENDADA) return "Retirada agendada";
  if (order.status === ORDER_STATUS.AGUARDANDO_CONFIRMACAO) return "Aguardando confirmação";
  return "Aguardando retirada";
}

const primeiraImagem = (ativo) => ativo?.imagens?.[0]?.url || null;

/** Resumo de um pedido para a lista: um produto por linha, como na tela. */
function linhaDeCompra(order) {
  const itens = order.itens || [];
  const primeiro = itens[0];

  return {
    id: order.id,
    pedido: `#${order.reference}`,
    reference: order.reference,
    data: order.createdAt,
    // Varios itens viram "X e mais N": a coluna e uma so, e truncar o nome do
    // primeiro escondendo que ha outros seria mentir por omissao.
    produto:
      itens.length > 1
        ? `${primeiro?.nameSnapshot} e mais ${itens.length - 1}`
        : primeiro?.nameSnapshot || "—",
    imagem: primeiraImagem(primeiro?.ativo),
    quantidade: itens.reduce((a, i) => a + i.quantity, 0),
    valor: cent(order.total),
    status: statusDaCompra(order),
  };
}

const INCLUDE_ITENS = () => [
  {
    model: db.OrderItem,
    as: "itens",
    include: [
      {
        model: db.Asset,
        as: "ativo",
        attributes: ["id", "slug", "name", "sku"],
        include: [
          {
            model: db.AssetImage,
            as: "imagens",
            attributes: ["url"],
            separate: true,
            order: [["position", "ASC"]],
            limit: 1,
          },
        ],
      },
    ],
  },
];

async function compras(userId, query) {
  const { page, perPage, limit, offset } = parsePagination(query);

  const resultado = await db.Order.findAndCountAll({
    where: { buyerId: userId },
    include: INCLUDE_ITENS(),
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  let linhas = resultado.rows.map(linhaDeCompra);
  // Filtro por status derivado: nao existe coluna para ele, entao filtra-se
  // depois de traduzir. E aceitavel porque a pagina do comprador e curta.
  if (query.status) linhas = linhas.filter((l) => l.status === query.status);

  return { rows: linhas, count: resultado.count, page, perPage };
}

/** Detalhe da compra: produto, compra, retirada e historico numa chamada. */
async function compra(userId, id) {
  const order = await db.Order.findOne({
    where: { id, buyerId: userId },
    include: INCLUDE_ITENS(),
  });
  if (!order) throw AppError.notFound("Compra não encontrada.", "ORDER_NOT_FOUND");

  const historico = await historicoDaCompra(order);

  return {
    id: order.id,
    pedido: `#${order.reference}`,
    reference: order.reference,
    data: order.createdAt,
    valor: cent(order.total),
    subtotal: cent(order.subtotal),
    formaPagamento: order.paymentMethod,
    statusPagamento: order.paymentStatus,
    status: statusDaCompra(order),
    itens: (order.itens || []).map((i) => ({
      id: i.id,
      nome: i.nameSnapshot,
      codigo: i.ativo?.sku || null,
      slug: i.ativo?.slug || null,
      imagem: primeiraImagem(i.ativo),
      quantidade: i.quantity,
      precoUnitario: cent(i.unitPrice),
      total: cent(i.total),
    })),
    // Retirada vive DENTRO da compra: nao existe pagina independente de
    // Retiradas na V1, e ela e um estado deste pedido.
    retirada:
      order.status === ORDER_STATUS.CANCELADO
        ? null
        : {
            status: order.pickupStatus,
            local: order.pickupLocation,
            endereco: order.pickupAddress,
            responsavel: order.pickupContactName,
            contato: order.pickupContactPhone,
            agendamento: order.pickupScheduledAt,
            concluidaEm: order.pickupCompletedAt,
            instrucoes: order.pickupInstructions || order.pickupNotes,
          },
    historico,
  };
}

/**
 * Historico da compra.
 *
 * Sai dos carimbos do proprio pedido, nao do log de auditoria: a auditoria
 * registra QUEM mudou o quê e e interna; o comprador quer a linha do tempo da
 * SUA compra. Etapas ainda nao atingidas voltam marcadas como futuras, para a
 * tela poder mostra-las apagadas em vez de escondê-las.
 */
async function historicoDaCompra(order) {
  const eventos = [];
  const add = (data, titulo, detalhe) => eventos.push({ data, titulo, detalhe });

  add(order.createdAt, "Compra registrada");
  if (order.confirmedAt) add(order.confirmedAt, "Compra confirmada");
  if (order.paymentConfirmedAt) add(order.paymentConfirmedAt, "Pagamento confirmado");

  if (order.status === ORDER_STATUS.CANCELADO) {
    add(order.canceledAt, "Compra cancelada", order.cancelReason);
    return eventos.filter((e) => e.data).sort((a, b) => new Date(a.data) - new Date(b.data));
  }

  if (order.pickupStatus === PICKUP_STATUS.AGUARDANDO && order.confirmedAt) {
    add(order.confirmedAt, "Retirada liberada");
  }
  if (order.pickupScheduledAt) add(order.pickupScheduledAt, "Retirada agendada");
  if (order.pickupCompletedAt) add(order.pickupCompletedAt, "Produto retirado");
  if (order.operationCompletedAt) add(order.operationCompletedAt, "Operação concluída");

  const feitos = eventos.filter((e) => e.data).sort((a, b) => new Date(a.data) - new Date(b.data));

  const futuros = [];
  if (!order.pickupScheduledAt && order.pickupStatus !== PICKUP_STATUS.NAO_APLICAVEL) {
    futuros.push({ titulo: "Retirada agendada", futuro: true });
  }
  if (!order.pickupCompletedAt && order.pickupStatus !== PICKUP_STATUS.NAO_APLICAVEL) {
    futuros.push({ titulo: "Retirada realizada", futuro: true });
  }
  if (!order.operationCompletedAt) futuros.push({ titulo: "Operação concluída", futuro: true });

  return [...feitos, ...futuros];
}

// ------------------------------------------------------------------ consultas

function linhaDeConsulta(q) {
  return {
    id: q.id,
    reference: q.reference,
    data: q.createdAt,
    produto: q.ativo?.name || "—",
    slug: q.ativo?.slug || null,
    imagem: primeiraImagem(q.ativo),
    quantidade: q.quantity,
    status: {
      [QUOTE_STATUS.NOVA]: "Recebida",
      [QUOTE_STATUS.EM_ATENDIMENTO]: "Em atendimento",
      [QUOTE_STATUS.RESPONDIDA]: "Respondida",
      [QUOTE_STATUS.ENCERRADA]: "Encerrada",
    }[q.status],
    atualizacao: q.respondedAt || q.updatedAt,
  };
}

const INCLUDE_ATIVO_CONSULTA = () => [
  {
    model: db.Asset,
    as: "ativo",
    attributes: ["id", "slug", "name", "price", "saleMode", "status"],
    include: [
      {
        model: db.AssetImage,
        as: "imagens",
        attributes: ["url"],
        separate: true,
        order: [["position", "ASC"]],
        limit: 1,
      },
    ],
  },
];

async function consultas(userId, query) {
  const { page, perPage, limit, offset } = parsePagination(query);
  const where = { buyerId: userId };
  if (query.status) where.status = query.status;

  const r = await db.Quote.findAndCountAll({
    where,
    include: INCLUDE_ATIVO_CONSULTA(),
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  return { rows: r.rows.map(linhaDeConsulta), count: r.count, page, perPage };
}

async function consulta(userId, id) {
  const q = await db.Quote.findOne({
    where: { id, buyerId: userId },
    include: INCLUDE_ATIVO_CONSULTA(),
  });
  if (!q) throw AppError.notFound("Consulta não encontrada.", "QUOTE_NOT_FOUND");

  return {
    ...linhaDeConsulta(q),
    mensagem: q.message,
    resposta: q.responseNotes,
    precoCotado: q.quotedPrice ? cent(q.quotedPrice) : null,
    respondidaEm: q.respondedAt,
    // O CTA "Comprar" so aparece quando ha condicoes respondidas E o ativo
    // continua publicado. Oferecer o botao antes disso levaria a uma compra
    // sobre condicoes que ainda nao existem.
    podeComprar:
      q.status === QUOTE_STATUS.RESPONDIDA && q.ativo?.status === ASSET_STATUS.PUBLICADO,
    // O fornecedor nao participa: nenhum dado dele sai daqui.
  };
}

// --------------------------------------------------------------- meus ativos

async function participacaoPara(modelo) {
  const settings = require("../settings/settings.service");
  return settings.percentualDoModelo(modelo);
}

async function ativos(userId, query) {
  const { page, perPage, limit, offset } = parsePagination(query);
  const where = { supplierId: userId };
  if (query.status) where.status = query.status;
  if (query.search) {
    const t = `%${query.search}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: t } },
      { sku: { [Op.iLike]: t } },
      { location: { [Op.iLike]: t } },
    ];
  }

  const r = await db.Asset.findAndCountAll({
    where,
    include: [
      { model: db.Category, as: "categoria", attributes: ["id", "slug", "name"] },
      { model: db.Subcategory, as: "subcategoria", attributes: ["id", "slug", "name"] },
      {
        model: db.AssetImage,
        as: "imagens",
        attributes: ["url"],
        separate: true,
        order: [["position", "ASC"]],
        limit: 1,
      },
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  // Um percentual por modelo EXISTENTE, resolvido a partir do vocabulario:
  // listar os modelos a mao deixava o modelo novo com `participacao`
  // undefined, e a receita potencial da linha saia NaN na tela.
  const pct = Object.fromEntries(
    await Promise.all(
      Object.values(MODELOS_COMERCIAIS).map(async (m) => [m, await participacaoPara(m)])
    )
  );

  const rows = r.rows.map((a) => {
    const participacao = pct[a.commercialModel];
    const preco = cent(a.price);
    return {
      id: a.id,
      codigo: a.sku,
      slug: a.slug,
      nome: a.name,
      imagem: a.imagens?.[0]?.url || null,
      categoria: a.categoria?.name || null,
      subcategoria: a.subcategoria?.name || null,
      local: a.location,
      condicao: a.condition,
      modelo: NOME_MODELO[a.commercialModel],
      modeloChave: a.commercialModel,
      preco,
      precoMercado: a.marketPrice ? cent(a.marketPrice) : null,
      participacao,
      // Receita potencial calculada ativo a ativo, com o percentual DAQUELE
      // modelo — o mesmo fornecedor pode ter um ativo a 65% e outro a 50%.
      receitaPotencial: cent((preco * a.quantity * participacao) / 100),
      quantidadeOriginal: a.originalQuantity,
      quantidadeDisponivel: a.quantity,
      quantidadeVendida: Math.max(0, a.originalQuantity - a.quantity),
      unidade: a.unit,
      status: ROTULO_ASSET[a.status],
      statusChave: a.status,
      publicadoEm: a.publishedAt,
      atualizadoEm: a.updatedAt,
    };
  });

  return { rows, count: r.count, page, perPage };
}

/**
 * Detalhe do ativo na visao do FORNECEDOR (revisao do cliente, item 9).
 *
 * "Falta uma coluna com a opcao de ver mais detalhes sobre o ativo dele e
 *  dentro desses detalhes um botao para eu conseguir aprovar."
 *
 * Existe como rota propria em vez de a tela reaproveitar a linha da lista por
 * duas razoes concretas:
 *
 *  - A lista devolve o que cabe numa TABELA. O detalhe precisa de descricao,
 *    de TODAS as fotos, da ficha tecnica e do historico — carregar isso para
 *    100 linhas encheria a listagem de dados que ninguem le.
 *  - O isolamento fica num lugar so. O `where` junta `id` e `supplierId`: um
 *    ativo que nao e do fornecedor nao devolve 403 (que confirmaria que ele
 *    existe) e sim 404, exatamente como um id inventado. Nao ha filtro visual
 *    nenhum — o ativo alheio nunca sai do banco.
 *
 * O que o fornecedor NAO ve aqui e tao deliberado como o que ve: nao ha dado
 * do comprador, nao ha receita da RED e nao ha custo de outro ativo.
 */
async function ativo(userId, id) {
  const a = await db.Asset.findOne({
    where: { id, supplierId: userId },
    include: [
      { model: db.Category, as: "categoria", attributes: ["id", "slug", "name"] },
      { model: db.Subcategory, as: "subcategoria", attributes: ["id", "slug", "name"] },
      {
        model: db.AssetImage,
        as: "imagens",
        attributes: ["id", "url", "alt", "position"],
        separate: true,
        order: [["position", "ASC"]],
      },
    ],
  });
  if (!a) throw AppError.notFound("Ativo não encontrado.", "ASSET_NOT_FOUND");

  const participacao = await participacaoPara(a.commercialModel);
  const preco = cent(a.price);
  const mercado = a.marketPrice ? cent(a.marketPrice) : null;

  // Quantidade vendida sai de original - disponivel, a mesma conta da lista:
  // duas contas diferentes para o mesmo numero divergiriam na primeira venda
  // parcial.
  const vendida = Math.max(0, a.originalQuantity - a.quantity);

  return {
    id: a.id,
    codigo: a.sku,
    slug: a.slug,
    nome: a.name,
    resumo: a.shortDescription || null,
    descricao: a.description || null,

    imagem: a.imagens?.[0]?.url || null,
    // Todas as fotos, na ordem da galeria: o fornecedor quer conferir o que a
    // RED publicou sobre o ativo DELE, e a primeira foto nao conta essa
    // historia.
    fotos: (a.imagens || []).map((i) => ({ id: i.id, url: i.url, alt: i.alt || a.name })),

    categoria: a.categoria?.name || null,
    subcategoria: a.subcategoria?.name || null,
    local: a.location,
    condicao: ROTULO_CONDICAO[a.condition] || null,
    condicaoChave: a.condition,
    marca: a.brand,
    material: a.material,
    cor: a.color,
    tamanho: a.size,
    formaVenda: ROTULO_FORMA_VENDA[a.saleFormat] || null,
    disponibilidade: ROTULO_DISPONIBILIDADE[a.availability] || null,
    modalidade: a.saleMode,
    // Ficha tecnica com o mesmo rotulo do site: sem ela o detalhe do
    // fornecedor mostraria menos sobre o ativo do que a pagina publica.
    ficha: CAMPOS_TECNICOS.filter((c) => a.attributes?.[c]).map((c) => ({
      campo: c,
      valor: a.attributes[c],
    })),

    modelo: NOME_MODELO[a.commercialModel],
    modeloChave: a.commercialModel,
    preco,
    precoMercado: mercado,
    desconto: a.descontoPercentual(),
    participacao,
    receitaPotencial: cent((preco * a.quantity * participacao) / 100),
    // Quanto ele ja recebeu ou vai receber por este ativo especifico, com o
    // percentual PRATICADO em cada venda (snapshot do repasse) — nao com o
    // percentual de hoje.
    ...(await realizadoDoAtivo(userId, a.id)),

    quantidadeOriginal: a.originalQuantity,
    quantidadeDisponivel: a.quantity,
    quantidadeVendida: vendida,
    unidade: a.unit,

    visualizacoes: Number(a.viewsCount || 0),

    status: ROTULO_ASSET[a.status],
    statusChave: a.status,
    publicadoEm: a.publishedAt,
    vendidoEm: a.soldAt,
    criadoEm: a.createdAt,
    atualizadoEm: a.updatedAt,
    aprovadoEm: a.supplierApprovedAt,

    /**
     * O botao de aprovar mora DENTRO do detalhe, e e a API que diz se ele
     * aparece. Deixar a tela decidir por comparacao de string levaria a
     * oferecer o botao num ativo ja publicado — e a aprovacao seria recusada
     * so depois do clique.
     */
    podeAprovar: a.status === ASSET_STATUS.AGUARDANDO_APROVACAO,
    // Pagina publica so existe depois de publicado; sem o slug o botao
    // "ver no site" levaria a um 404.
    linkPublico: a.status === ASSET_STATUS.PUBLICADO && a.slug ? `/produto/${a.slug}` : null,

    historico: await historicoDoAtivo(a),
  };
}

/** Quanto este ativo ja rendeu ao fornecedor, pelos repasses que o citam. */
async function realizadoDoAtivo(userId, assetId) {
  const repasses = await db.Payout.findAll({
    where: { supplierId: userId, assetId },
    attributes: ["status", "supplierAmount", "grossAmount"],
  });

  const vivos = repasses.filter((r) => r.status !== PAYOUT_STATUS.CANCELADO);
  return {
    vendasDoAtivo: vivos.length,
    valorVendidoDoAtivo: cent(vivos.reduce((t, r) => t + Number(r.grossAmount), 0)),
    receitaRealizada: cent(vivos.reduce((t, r) => t + Number(r.supplierAmount), 0)),
    receitaRecebida: cent(
      repasses
        .filter((r) => r.status === PAYOUT_STATUS.PAGO)
        .reduce((t, r) => t + Number(r.supplierAmount), 0)
    ),
  };
}

/**
 * Historico de status do ativo.
 *
 * Sai do log de auditoria — que e onde a mudanca de status fica registrada com
 * data e motivo — e nao dos carimbos da tabela, que so guardam tres momentos.
 * O fornecedor ve O QUE aconteceu e QUANDO; NAO ve quem da RED fez, porque o
 * ator e informacao interna.
 */
async function historicoDoAtivo(a) {
  const logs = await db.AuditLog.findAll({
    where: { entity: "asset", entityId: a.id },
    order: [["occurredAt", "ASC"]],
  });

  const linhas = [];
  for (const log of logs) {
    if (log.action === "cadastro") {
      linhas.push({ data: log.occurredAt, titulo: "Ativo cadastrado na RED" });
    } else if (log.action === "mudanca_status") {
      const destino = log.after?.status;
      linhas.push({
        data: log.occurredAt,
        titulo: `Status: ${ROTULO_ASSET[destino] || destino}`,
        detalhe: log.notes || null,
      });
    } else if (log.action === "aprovacao_fornecedor") {
      linhas.push({ data: log.occurredAt, titulo: "Preço e modelo aprovados por você" });
    }
    // `update` fica de fora de proposito: uma correcao de descricao pela
    // curadoria nao e um acontecimento da vida comercial do ativo, e encheria
    // a linha do tempo de ruido.
  }

  // Fallback para o acervo antigo, anterior ao log: sem isto o ativo
  // importado aparecia com historico vazio, como se nunca tivesse existido.
  if (!linhas.length) {
    linhas.push({ data: a.createdAt, titulo: "Ativo cadastrado na RED" });
    if (a.supplierApprovedAt) {
      linhas.push({ data: a.supplierApprovedAt, titulo: "Preço e modelo aprovados por você" });
    }
    if (a.publishedAt) linhas.push({ data: a.publishedAt, titulo: "Publicado no catálogo" });
    if (a.soldAt) linhas.push({ data: a.soldAt, titulo: "Vendido" });
  }

  return linhas.filter((l) => l.data).sort((x, y) => new Date(x.data) - new Date(y.data));
}

// -------------------------------------------------------------------- vendas

const INCLUDE_VENDA = () => [
  { model: db.Order, as: "pedido", attributes: ["id", "reference", "createdAt", "pickupStatus", "status", "operationCompletedAt"] },
  { model: db.OrderItem, as: "item", attributes: ["id", "nameSnapshot", "quantity", "unitPrice"] },
  { model: db.Asset, as: "ativo", attributes: ["id", "slug", "name", "sku"] },
];

function linhaDeVenda(p) {
  return {
    id: p.id,
    venda: `#${p.pedido?.reference || ""}`,
    orderId: p.orderId,
    data: p.pedido?.createdAt || p.createdAt,
    ativo: p.item?.nameSnapshot || p.ativo?.name || "—",
    assetId: p.assetId,
    // O slug ja vinha no include e nao era exposto; sem ele a tela de Vendas
    // nao tinha como abrir a pagina do ativo vendido.
    slug: p.ativo?.slug || null,
    quantidade: p.item?.quantity || null,
    valorVenda: cent(p.grossAmount),
    custos: cent(p.approvedCosts),
    valorLiquido: cent(p.netAmount),
    // Snapshot: o percentual lido e o gravado no repasse, nunca o atual da
    // modalidade. Mudar a tabela amanha nao move esta linha.
    participacao: Number(p.supplierPercent),
    valorFornecedor: cent(p.supplierAmount),
    modelo: NOME_MODELO[p.commercialModel],
    statusRetirada: {
      [PICKUP_STATUS.NAO_APLICAVEL]: "Não aplicável",
      [PICKUP_STATUS.AGUARDANDO]: "Aguardando retirada",
      [PICKUP_STATUS.AGENDADA]: "Retirada agendada",
      [PICKUP_STATUS.CONCLUIDA]: "Retirado",
    }[p.pedido?.pickupStatus],
    status: ROTULO_PAYOUT[p.status],
    statusChave: p.status,
    prazo: p.dueAt,
    pagoEm: p.paidAt,
  };
}

async function vendas(userId, query) {
  const { page, perPage, limit, offset } = parsePagination(query);
  const where = { supplierId: userId };
  if (query.status) where.status = query.status;
  if (query.desde) where.createdAt = { [Op.gte]: new Date(query.desde) };

  const r = await db.Payout.findAndCountAll({
    where,
    include: INCLUDE_VENDA(),
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  return { rows: r.rows.map(linhaDeVenda), count: r.count, page, perPage };
}

/** Historico de pagamentos: so o que ja foi efetivamente liquidado. */
async function pagamentos(userId, query) {
  const { page, perPage, limit, offset } = parsePagination(query);

  const r = await db.Payout.findAndCountAll({
    where: { supplierId: userId, status: PAYOUT_STATUS.PAGO },
    include: INCLUDE_VENDA(),
    order: [["paidAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  const rows = r.rows.map((p) => ({
    id: p.id,
    data: p.paidAt,
    venda: `#${p.pedido?.reference || ""}`,
    ativo: p.item?.nameSnapshot || p.ativo?.name || "—",
    valor: cent(p.supplierAmount),
    meio: p.paymentMethod || "—",
    comprovante: p.paymentReference || "—",
  }));

  return { rows, count: r.count, page, perPage };
}

module.exports = {
  compras,
  compra,
  consultas,
  consulta,
  ativos,
  ativo,
  vendas,
  pagamentos,
  statusDaCompra,
  linhaDeVenda,
  NOME_MODELO,
  ROTULO_ASSET,
  ROTULO_PAYOUT,
};
