"use strict";

const { Op, fn, col, literal } = require("sequelize");
const db = require("../../models");
const { AppError } = require("../../utils/app-error");
const { parsePagination } = require("../../utils/pagination");
const settings = require("../settings/settings.service");
const comercial = require("./management.comercial");
const { NOME_MODELO, ROTULO_PAYOUT } = require("../me/me.painel");
const { PAYOUT_STATUS, PICKUP_STATUS, PRAZO_REPASSE_HORAS } = require("../../config/constants");

const { janela, entre, cent } = comercial;

/**
 * Financeiro da gestao.
 *
 * A relacao entre os indicadores e verificavel na propria tela:
 *
 *   valor bruto            = receita RED + valor dos fornecedores + custos
 *   valor dos fornecedores = a repassar + repassado
 *
 * Os totais saem somados das MESMAS linhas que a tabela mostra. Se o filtro
 * muda, o rodape acompanha — nao ha como o total discordar da tabela acima.
 */
async function movimentacoes(query) {
  const lista = await comercial.vendas(query, { comFinanceiro: true });
  const totais = await totaisDoFiltro(query);
  return { ...lista, totais };
}

/** Totais do recorte inteiro, nao so da pagina visivel. */
async function totaisDoFiltro(query) {
  const periodo = janela(query);
  const where = { status: { [Op.ne]: PAYOUT_STATUS.CANCELADO }, ...entre("createdAt", periodo) };
  if (query.supplierId) where.supplierId = query.supplierId;
  if (query.commercialModel) where.commercialModel = query.commercialModel;
  if (query.status) where.status = query.status;

  const agg = await db.Payout.findOne({
    where,
    attributes: [
      [fn("COUNT", col("id")), "operacoes"],
      [fn("COALESCE", fn("SUM", col("gross_amount")), 0), "bruto"],
      [fn("COALESCE", fn("SUM", col("approved_costs")), 0), "custos"],
      [fn("COALESCE", fn("SUM", col("net_amount")), 0), "liquido"],
      [fn("COALESCE", fn("SUM", col("supplier_amount")), 0), "fornecedores"],
      [fn("COALESCE", fn("SUM", col("red_amount")), 0), "red"],
    ],
    raw: true,
  });

  return {
    operacoes: Number(agg.operacoes),
    valorBruto: cent(agg.bruto),
    custosAprovados: cent(agg.custos),
    valorLiquido: cent(agg.liquido),
    valorFornecedores: cent(agg.fornecedores),
    receitaRed: cent(agg.red),
  };
}

/**
 * Indicadores financeiros (secao 20 do documento).
 *
 * `posicao` e acumulada e sem filtro — quanto a RED deve e ja pagou, hoje.
 * `periodo` responde ao filtro. Separados porque respondem a perguntas
 * diferentes e misturá-los faria "A repassar" encolher ao filtrar 7 dias,
 * como se a divida tivesse diminuido.
 */
async function indicadores(query) {
  const periodo = janela(query);
  const noPeriodo = entre("createdAt", periodo);
  const ativos = [
    PAYOUT_STATUS.VENDA_REALIZADA,
    PAYOUT_STATUS.A_RECEBER,
    PAYOUT_STATUS.PAGAMENTO_PROGRAMADO,
    PAYOUT_STATUS.PAGO,
  ];

  const soma = async (where, campo) =>
    cent(await db.Payout.sum(campo, { where: { status: { [Op.in]: ativos }, ...where } }));

  const [
    brutoPeriodo,
    redPeriodo,
    fornecedoresPeriodo,
    aRepassar,
    repassado,
    devidos,
  ] = await Promise.all([
    soma(noPeriodo, "gross_amount"),
    soma(noPeriodo, "red_amount"),
    soma(noPeriodo, "supplier_amount"),
    cent(
      await db.Payout.sum("supplier_amount", {
        where: {
          status: { [Op.in]: [PAYOUT_STATUS.A_RECEBER, PAYOUT_STATUS.PAGAMENTO_PROGRAMADO] },
        },
      })
    ),
    cent(await db.Payout.sum("supplier_amount", { where: { status: PAYOUT_STATUS.PAGO } })),
    db.Payout.count({
      where: {
        status: { [Op.in]: [PAYOUT_STATUS.A_RECEBER, PAYOUT_STATUS.PAGAMENTO_PROGRAMADO] },
      },
    }),
  ]);

  return {
    periodo: { desde: periodo.desde, ate: periodo.ate },
    fluxo: {
      valorBrutoVendido: brutoPeriodo,
      receitaRed: redPeriodo,
      valorFornecedores: fornecedoresPeriodo,
    },
    posicao: { aRepassar, repassado, repassesPendentes: devidos },
  };
}

/**
 * Detalhe financeiro da venda.
 *
 * Devolve as regras comerciais APLICADAS naquela venda — nao as atuais. Se o
 * RED Catalogo mudar de 65% para 60% amanha, esta resposta continua a dizer
 * 65%, porque foi isso que foi acordado, calculado e pago.
 */
async function movimentacao(id) {
  const p = await db.Payout.findByPk(id, {
    include: [
      { model: db.Order, as: "pedido" },
      { model: db.OrderItem, as: "item" },
      { model: db.Asset, as: "ativo", attributes: ["id", "slug", "name", "sku", "location"] },
      { model: db.User, as: "fornecedor", attributes: ["id", "name", "companyTradeName", "email"] },
    ],
  });
  if (!p) throw AppError.notFound("Movimentação não encontrada.", "PAYOUT_NOT_FOUND");

  const custos = await db.Cost.findAll({
    where: { orderId: p.orderId },
    order: [["createdAt", "ASC"]],
  });

  return {
    id: p.id,
    venda: `#${p.pedido?.reference || ""}`,
    orderId: p.orderId,
    data: p.pedido?.createdAt || p.createdAt,
    cliente: p.pedido?.buyerName || "—",
    fornecedor: p.fornecedor?.companyTradeName || p.fornecedor?.name || "—",
    fornecedorId: p.supplierId,
    ativo: p.item?.nameSnapshot || p.ativo?.name || "—",
    assetId: p.assetId,
    quantidade: p.item?.quantity || null,
    statusRetirada: {
      [PICKUP_STATUS.NAO_APLICAVEL]: "Não aplicável",
      [PICKUP_STATUS.AGUARDANDO]: "Aguardando retirada",
      [PICKUP_STATUS.AGENDADA]: "Retirada agendada",
      [PICKUP_STATUS.CONCLUIDA]: "Retirado",
    }[p.pedido?.pickupStatus],

    // O snapshot completo — os campos separados que a secao 27 exige.
    regras: {
      modelo: NOME_MODELO[p.commercialModel],
      modeloChave: p.commercialModel,
      valorBruto: cent(p.grossAmount),
      custosAprovados: cent(p.approvedCosts),
      valorLiquido: cent(p.netAmount),
      participacaoFornecedor: Number(p.supplierPercent),
      participacaoRed: Number(p.redPercent),
      valorFornecedor: cent(p.supplierAmount),
      receitaRed: cent(p.redAmount),
    },

    custos: custos.map((c) => ({
      id: c.id,
      tipo: c.type,
      descricao: c.description,
      valor: cent(c.amount),
      aprovadoEm: c.approvedAt,
    })),

    financeiro: {
      status: ROTULO_PAYOUT[p.status],
      statusChave: p.status,
      previsaoPagamento: p.dueAt,
      programadoPara: p.scheduledAt,
      pagamento: p.paidAt,
      meio: p.paymentMethod,
      comprovante: p.paymentReference,
      prazoHoras: PRAZO_REPASSE_HORAS,
    },

    historico: await historicoDaVenda(p),
  };
}

/** Linha do tempo da venda, montada dos carimbos do pedido e do repasse. */
async function historicoDaVenda(p) {
  const o = p.pedido;
  const eventos = [];
  const add = (data, titulo, detalhe) => data && eventos.push({ data, titulo, detalhe });

  add(o?.createdAt, "Venda realizada", `Venda #${o?.reference} registrada.`);
  add(
    p.createdAt,
    "Cálculo financeiro",
    `Regras comerciais aplicadas. Valor do fornecedor: ${cent(p.supplierAmount)} | Receita RED: ${cent(
      p.redAmount
    )}`
  );
  add(o?.paymentConfirmedAt, "Pagamento do comprador confirmado");
  add(o?.pickupScheduledAt, "Retirada agendada");
  add(o?.pickupCompletedAt, "Retirada concluída");
  add(
    o?.operationCompletedAt,
    "Operação concluída",
    `Valor passou a A RECEBER. Prazo de repasse: ${PRAZO_REPASSE_HORAS}h.`
  );
  add(p.scheduledAt, "Pagamento programado");
  add(p.paidAt, "Repasse realizado", p.paymentReference ? `Comprovante ${p.paymentReference}` : null);

  return eventos.sort((a, b) => new Date(a.data) - new Date(b.data));
}

/**
 * Repasses, com aging.
 *
 * O prazo e regra de negocio, nao meta interna: 48h contadas do registo de
 * conclusao integral. Por isso cada linha traz quantas horas faltam e a
 * situacao — vencido, vencendo, no prazo. Um numero que so aparece depois de
 * estourado nao serve como alerta.
 */
async function repasses(query) {
  const { page, perPage, limit, offset } = parsePagination(query);
  const agora = new Date();
  const alertaHoras = Number(await settings.valor("repasse.alertaHoras")) || 24;

  const porAba = {
    devidos: [PAYOUT_STATUS.A_RECEBER],
    programados: [PAYOUT_STATUS.PAGAMENTO_PROGRAMADO],
    pagos: [PAYOUT_STATUS.PAGO],
    pendentes: [PAYOUT_STATUS.A_RECEBER, PAYOUT_STATUS.PAGAMENTO_PROGRAMADO],
  };
  const status = porAba[query.aba || "pendentes"];
  if (!status) throw AppError.badRequest("Aba inválida.", "INVALID_TAB", { abas: Object.keys(porAba) });

  const where = { status: { [Op.in]: status } };
  if (query.supplierId) where.supplierId = query.supplierId;

  const r = await db.Payout.findAndCountAll({
    where,
    include: [
      { model: db.Order, as: "pedido", attributes: ["id", "reference"] },
      { model: db.OrderItem, as: "item", attributes: ["id", "nameSnapshot"] },
      { model: db.User, as: "fornecedor", attributes: ["id", "name", "companyTradeName"] },
    ],
    order: [["dueAt", "ASC NULLS LAST"]],
    limit,
    offset,
    distinct: true,
  });

  const rows = r.rows.map((p) => {
    const horas = p.dueAt ? (new Date(p.dueAt) - agora) / 3600000 : null;
    return {
      id: p.id,
      venda: `#${p.pedido?.reference || ""}`,
      orderId: p.orderId,
      fornecedor: p.fornecedor?.companyTradeName || p.fornecedor?.name || "—",
      fornecedorId: p.supplierId,
      ativo: p.item?.nameSnapshot || "—",
      valor: cent(p.supplierAmount),
      prazo: p.dueAt,
      horasRestantes: horas === null ? null : Number(horas.toFixed(1)),
      situacao:
        horas === null ? "sem_prazo" : horas < 0 ? "vencido" : horas <= alertaHoras ? "vencendo" : "no_prazo",
      status: ROTULO_PAYOUT[p.status],
      statusChave: p.status,
      programadoPara: p.scheduledAt,
      pagoEm: p.paidAt,
      meio: p.paymentMethod,
      comprovante: p.paymentReference,
    };
  });

  return { rows, count: r.count, page, perPage, resumo: await resumoDeRepasses(alertaHoras) };
}

/** Os quatro cartoes do topo de Repasses. Sempre acumulado — divida nao tem
 *  periodo: ou esta em aberto agora, ou nao esta. */
async function resumoDeRepasses(alertaHoras) {
  const agora = new Date();
  const limite = new Date(agora.getTime() + alertaHoras * 3600000);
  const devidos = { [Op.in]: [PAYOUT_STATUS.A_RECEBER, PAYOUT_STATUS.PAGAMENTO_PROGRAMADO] };

  const [aRepassar, vencidos, vencendo, programados, pagos, contagens] = await Promise.all([
    db.Payout.sum("supplier_amount", { where: { status: PAYOUT_STATUS.A_RECEBER } }),
    db.Payout.sum("supplier_amount", { where: { status: devidos, dueAt: { [Op.lt]: agora } } }),
    db.Payout.sum("supplier_amount", {
      where: { status: devidos, dueAt: { [Op.between]: [agora, limite] } },
    }),
    db.Payout.sum("supplier_amount", { where: { status: PAYOUT_STATUS.PAGAMENTO_PROGRAMADO } }),
    db.Payout.sum("supplier_amount", { where: { status: PAYOUT_STATUS.PAGO } }),
    db.Payout.findAll({
      attributes: ["status", [fn("COUNT", col("id")), "total"]],
      group: ["status"],
      raw: true,
    }),
  ]);

  const n = Object.fromEntries(contagens.map((c) => [c.status, Number(c.total)]));

  return {
    aRepassar: cent(aRepassar),
    vencidos: cent(vencidos),
    vencendoEm: cent(vencendo),
    programados: cent(programados),
    repassado: cent(pagos),
    contagem: {
      devidos: n[PAYOUT_STATUS.A_RECEBER] || 0,
      programados: n[PAYOUT_STATUS.PAGAMENTO_PROGRAMADO] || 0,
      pagos: n[PAYOUT_STATUS.PAGO] || 0,
    },
    alertaHoras,
    prazoHoras: PRAZO_REPASSE_HORAS,
  };
}

module.exports = {
  movimentacoes,
  totaisDoFiltro,
  indicadores,
  movimentacao,
  repasses,
  resumoDeRepasses,
};
