"use strict";

const { Op } = require("sequelize");
const db = require("../../models");
const { env } = require("../../config/env");
const { AppError } = require("../../utils/app-error");
const { parsePagination } = require("../../utils/pagination");
const notificacoes = require("../notifications/notifications.service");
const {
  PAYOUT_STATUS,
  MODELOS_COMERCIAIS,
  PRAZO_REPASSE_HORAS,
} = require("../../config/constants");

/** Percentual do fornecedor conforme o modelo comercial do ativo. */
function percentualDoFornecedor(modelo) {
  return modelo === MODELOS_COMERCIAIS.ESTOQUE
    ? env.business.splitSupplier.estoque
    : env.business.splitSupplier.catalogo;
}

const cent = (n) => Number(Number(n).toFixed(2));

/**
 * REGRA FINANCEIRA-MESTRE V1 (documento oficial, secao 27).
 *
 *   valor_liquido    = valor_bruto - custos_aprovados
 *   valor_fornecedor = valor_liquido x percentual_fornecedor
 *   receita_red      = valor_liquido - valor_fornecedor
 *
 * O split incide sobre o LIQUIDO, nunca sobre o bruto. Um transporte de
 * R$ 1.000 numa venda de R$ 10.000 sai do bolso dos dois lados, na proporcao
 * do modelo comercial — nao so do lado da RED.
 *
 * A parte da RED sai por subtracao para nao criar centavo no arredondamento.
 */
function calcular({ bruto, custos, percentualFornecedor }) {
  const valorBruto = cent(bruto);
  const custosAprovados = cent(Math.max(0, custos));
  // Custo nunca pode tornar o liquido negativo: no limite, zera.
  const liquido = cent(Math.max(0, valorBruto - custosAprovados));

  const fornecedor = cent((liquido * percentualFornecedor) / 100);
  const red = cent(liquido - fornecedor);

  return {
    grossAmount: valorBruto,
    approvedCosts: custosAprovados,
    netAmount: liquido,
    supplierPercent: percentualFornecedor,
    redPercent: 100 - percentualFornecedor,
    supplierAmount: fornecedor,
    redAmount: red,
  };
}

/**
 * Rateia os custos do pedido entre os itens.
 *
 * Custo com `orderItemId` pertence aquele item. Custo sem vinculo e do pedido
 * inteiro e e distribuido na proporcao do bruto de cada item — quem representa
 * metade da venda absorve metade do transporte.
 */
function ratearCustos(itens, custos) {
  const porItem = new Map(itens.map((i) => [i.id, 0]));

  const brutoTotal = itens.reduce((soma, i) => soma + Number(i.total), 0);
  const doPedido = [];

  for (const custo of custos) {
    const valor = Number(custo.amount);
    if (custo.orderItemId && porItem.has(custo.orderItemId)) {
      porItem.set(custo.orderItemId, porItem.get(custo.orderItemId) + valor);
    } else {
      doPedido.push(valor);
    }
  }

  const totalPedido = doPedido.reduce((a, b) => a + b, 0);

  if (totalPedido > 0 && brutoTotal > 0) {
    // Rateia e joga a sobra de centavos no ultimo item, para a soma fechar.
    let distribuido = 0;
    itens.forEach((item, i) => {
      const ehUltimo = i === itens.length - 1;
      const parcela = ehUltimo
        ? cent(totalPedido - distribuido)
        : cent((totalPedido * Number(item.total)) / brutoTotal);
      distribuido = cent(distribuido + parcela);
      porItem.set(item.id, cent(porItem.get(item.id) + parcela));
    });
  }

  return porItem;
}

/**
 * Gera os repasses de um pedido confirmado.
 *
 * Nasce em VENDA_REALIZADA, nunca em A_RECEBER: o valor so passa a ser devido
 * apos a conclusao integral da operacao (secao 15).
 */
async function gerarParaPedido(order, itens, { transaction }) {
  const custos = await db.Cost.findAll({
    where: { orderId: order.id },
    transaction,
  });

  const custoPorItem = ratearCustos(itens, custos);
  const registros = [];

  for (const item of itens) {
    const ativo = item.assetId
      ? await db.Asset.findByPk(item.assetId, { transaction })
      : null;

    const modelo = ativo?.commercialModel || MODELOS_COMERCIAIS.CATALOGO;
    const conta = calcular({
      bruto: item.total,
      custos: custoPorItem.get(item.id) || 0,
      percentualFornecedor: percentualDoFornecedor(modelo),
    });

    registros.push({
      orderId: order.id,
      orderItemId: item.id,
      assetId: item.assetId,
      supplierId: ativo?.supplierId || null,
      commercialModel: modelo,
      ...conta,
      status: PAYOUT_STATUS.VENDA_REALIZADA,
    });
  }

  if (!registros.length) return [];
  return db.Payout.bulkCreate(registros, { transaction });
}

/**
 * Recalcula os repasses de um pedido apos mudanca nos custos.
 *
 * So enquanto o valor ainda nao virou devido: depois da conclusao integral o
 * repasse esta congelado, e a secao 8 e clara — alteracoes futuras nao podem
 * recalcular vendas ja realizadas.
 */
async function recalcularDoPedido(orderId, { transaction } = {}) {
  const executar = async (t) => {
    const order = await db.Order.findByPk(orderId, {
      include: [{ model: db.OrderItem, as: "itens" }],
      transaction: t,
    });
    if (!order) throw AppError.notFound("Pedido nao encontrado.", "ORDER_NOT_FOUND");

    const repasses = await db.Payout.findAll({ where: { orderId }, transaction: t });
    if (!repasses.length) return [];

    const congelado = repasses.find((r) => r.status !== PAYOUT_STATUS.VENDA_REALIZADA);
    if (congelado) {
      throw AppError.unprocessable(
        "Repasse ja congelado: a operacao foi concluida e o valor nao pode ser recalculado.",
        "PAYOUT_FROZEN",
        { status: congelado.status }
      );
    }

    const custos = await db.Cost.findAll({ where: { orderId }, transaction: t });
    const custoPorItem = ratearCustos(order.itens, custos);
    const porItemId = new Map(repasses.map((r) => [r.orderItemId, r]));

    for (const item of order.itens) {
      const repasse = porItemId.get(item.id);
      if (!repasse) continue;

      const conta = calcular({
        bruto: item.total,
        custos: custoPorItem.get(item.id) || 0,
        percentualFornecedor: repasse.supplierPercent,
      });
      await repasse.update(conta, { transaction: t });
    }

    const totalCustos = custos.reduce((soma, c) => soma + Number(c.amount), 0);
    await order.update({ approvedCosts: cent(totalCustos) }, { transaction: t });

    return db.Payout.findAll({ where: { orderId }, transaction: t });
  };

  return transaction ? executar(transaction) : db.sequelize.transaction(executar);
}

/**
 * Conclusao integral da operacao: os repasses passam a A_RECEBER e ganham
 * prazo de 48h (secoes 16 e 17).
 */
async function marcarOperacaoConcluida(orderId, { transaction }) {
  const limite = new Date(Date.now() + PRAZO_REPASSE_HORAS * 60 * 60 * 1000);

  const [afetados] = await db.Payout.update(
    { status: PAYOUT_STATUS.A_RECEBER, dueAt: limite },
    {
      where: { orderId, status: PAYOUT_STATUS.VENDA_REALIZADA },
      transaction,
    }
  );

  return { atualizados: afetados, dueAt: limite };
}

async function cancelarDoPedido(orderId, { transaction } = {}) {
  return db.Payout.update(
    { status: PAYOUT_STATUS.CANCELADO },
    {
      where: {
        orderId,
        status: {
          [Op.in]: [PAYOUT_STATUS.VENDA_REALIZADA, PAYOUT_STATUS.A_RECEBER],
        },
      },
      transaction,
    }
  );
}

/**
 * Totais do fornecedor na sequencia oficial:
 * POTENCIAL -> REALIZADO -> A RECEBER -> RECEBIDO.
 *
 * A regra manda nao somar o mesmo valor em categorias mutuamente excludentes,
 * entao cada repasse aparece em exatamente um balde.
 */
async function resumoDoFornecedor(supplierId) {
  const linhas = await db.Payout.findAll({
    where: { supplierId },
    attributes: [
      "status",
      [db.sequelize.fn("SUM", db.sequelize.col("supplier_amount")), "total"],
      [db.sequelize.fn("COUNT", db.sequelize.col("id")), "quantidade"],
    ],
    group: ["status"],
    raw: true,
  });

  const porStatus = Object.fromEntries(
    linhas.map((l) => [l.status, { total: Number(l.total), quantidade: Number(l.quantidade) }])
  );
  const valor = (s) => porStatus[s]?.total ?? 0;

  // Receita potencial: participacao do fornecedor caso os ativos publicados
  // sejam vendidos pelo preco vigente. E fotografia do agora, nao do periodo.
  const publicados = await db.Asset.findAll({
    where: { supplierId, status: "publicado" },
    attributes: ["price", "quantity", "commercialModel"],
    raw: true,
  });

  const potencial = publicados.reduce((soma, a) => {
    const bruto = Number(a.price || 0) * Number(a.quantity || 0);
    const pct = percentualDoFornecedor(a.commercialModel);
    return soma + (bruto * pct) / 100;
  }, 0);

  const aReceber = valor(PAYOUT_STATUS.A_RECEBER) + valor(PAYOUT_STATUS.PAGAMENTO_PROGRAMADO);

  return {
    receitaPotencial: cent(potencial),
    vendasRealizadas: cent(valor(PAYOUT_STATUS.VENDA_REALIZADA)),
    aReceber: cent(aReceber),
    recebido: cent(valor(PAYOUT_STATUS.PAGO)),
    cancelado: cent(valor(PAYOUT_STATUS.CANCELADO)),
    quantidade: {
      vendasRealizadas: porStatus[PAYOUT_STATUS.VENDA_REALIZADA]?.quantidade ?? 0,
      aReceber:
        (porStatus[PAYOUT_STATUS.A_RECEBER]?.quantidade ?? 0) +
        (porStatus[PAYOUT_STATUS.PAGAMENTO_PROGRAMADO]?.quantidade ?? 0),
      recebido: porStatus[PAYOUT_STATUS.PAGO]?.quantidade ?? 0,
    },
  };
}

/** Metricas globais da RED (secao 20) — visao do painel de gestao. */
async function resumoDaPlataforma({ desde = null } = {}) {
  const where = {};
  if (desde) where.createdAt = { [Op.gte]: desde };

  const linhas = await db.Payout.findAll({
    where,
    attributes: [
      "status",
      [db.sequelize.fn("SUM", db.sequelize.col("gross_amount")), "bruto"],
      [db.sequelize.fn("SUM", db.sequelize.col("approved_costs")), "custos"],
      [db.sequelize.fn("SUM", db.sequelize.col("net_amount")), "liquido"],
      [db.sequelize.fn("SUM", db.sequelize.col("supplier_amount")), "fornecedores"],
      [db.sequelize.fn("SUM", db.sequelize.col("red_amount")), "red"],
    ],
    group: ["status"],
    raw: true,
  });

  const soma = (campo, statuses = null) =>
    linhas
      .filter((l) => !statuses || statuses.includes(l.status))
      .reduce((a, l) => a + Number(l[campo] || 0), 0);

  const ativos = [
    PAYOUT_STATUS.VENDA_REALIZADA,
    PAYOUT_STATUS.A_RECEBER,
    PAYOUT_STATUS.PAGAMENTO_PROGRAMADO,
    PAYOUT_STATUS.PAGO,
  ];

  return {
    valorBrutoVendido: cent(soma("bruto", ativos)),
    custosAprovados: cent(soma("custos", ativos)),
    valorLiquido: cent(soma("liquido", ativos)),
    receitaRed: cent(soma("red", ativos)),
    valorDosFornecedores: cent(soma("fornecedores", ativos)),
    aRepassar: cent(
      soma("fornecedores", [PAYOUT_STATUS.A_RECEBER, PAYOUT_STATUS.PAGAMENTO_PROGRAMADO])
    ),
    repassado: cent(soma("fornecedores", [PAYOUT_STATUS.PAGO])),
  };
}

async function listar(query, { supplierId = null } = {}) {
  const { page, perPage, limit, offset } = parsePagination(query);
  const where = {};
  if (supplierId) where.supplierId = supplierId;
  else if (query.supplierId) where.supplierId = query.supplierId;
  if (query.status) where.status = query.status;

  // Filtro de prazo — o painel precisa distinguir no prazo / vencendo / vencido.
  if (query.prazo) {
    const agora = new Date();
    const em24h = new Date(agora.getTime() + 24 * 60 * 60 * 1000);
    if (query.prazo === "vencido") where.dueAt = { [Op.lt]: agora };
    if (query.prazo === "vencendo") where.dueAt = { [Op.between]: [agora, em24h] };
    if (query.prazo === "no_prazo") where.dueAt = { [Op.gt]: em24h };
  }

  const resultado = await db.Payout.findAndCountAll({
    where,
    include: [
      { model: db.Order, as: "pedido", attributes: ["id", "reference", "status", "createdAt"] },
      { model: db.Asset, as: "ativo", attributes: ["id", "slug", "name"] },
      { model: db.User, as: "fornecedor", attributes: ["id", "name", "email"] },
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  return { ...resultado, page, perPage };
}

/** Agenda o pagamento. So faz sentido sobre valor ja devido. */
async function programarPagamento(ids, { scheduledAt } = {}) {
  const [afetados] = await db.Payout.update(
    {
      status: PAYOUT_STATUS.PAGAMENTO_PROGRAMADO,
      scheduledAt: scheduledAt || new Date(),
    },
    { where: { id: { [Op.in]: ids }, status: PAYOUT_STATUS.A_RECEBER } }
  );

  if (!afetados) {
    throw AppError.unprocessable(
      "Nenhum repasse em 'a receber' entre os ids informados.",
      "NO_RECEIVABLE_PAYOUTS"
    );
  }
  return { atualizados: afetados };
}

/** Marca como pago. Nunca pula a conclusao: venda_realizada nao e pagavel. */
async function marcarPagos(ids, { notes, paymentReference, paymentMethod } = {}) {
  const [afetados] = await db.Payout.update(
    {
      status: PAYOUT_STATUS.PAGO,
      paidAt: new Date(),
      ...(notes ? { notes } : {}),
      ...(paymentReference ? { paymentReference } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
    },
    {
      where: {
        id: { [Op.in]: ids },
        status: {
          [Op.in]: [PAYOUT_STATUS.A_RECEBER, PAYOUT_STATUS.PAGAMENTO_PROGRAMADO],
        },
      },
    }
  );

  if (!afetados) {
    throw AppError.unprocessable(
      "Nenhum repasse devido entre os ids informados. O valor so e pagavel apos a conclusao integral da operacao.",
      "NO_PAYABLE_PAYOUTS"
    );
  }

  const pagos = await db.Payout.findAll({ where: { id: { [Op.in]: ids } } });
  for (const p of pagos) {
    if (!p.supplierId) continue;
    notificacoes.notificar(
      p.supplierId,
      notificacoes.TIPOS.PAGAMENTO_REALIZADO,
      { amount: p.supplierAmount, entity: "payout", entityId: p.id },
      { email: true }
    );
  }

  return { atualizados: afetados };
}

module.exports = {
  calcular,
  ratearCustos,
  gerarParaPedido,
  recalcularDoPedido,
  marcarOperacaoConcluida,
  cancelarDoPedido,
  resumoDoFornecedor,
  resumoDaPlataforma,
  listar,
  programarPagamento,
  marcarPagos,
  percentualDoFornecedor,
};
