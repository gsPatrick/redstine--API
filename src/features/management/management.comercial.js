"use strict";

const { Op, fn, col, literal } = require("sequelize");
const db = require("../../models");
const settings = require("../settings/settings.service");
const { NOME_MODELO, ROTULO_ASSET, ROTULO_PAYOUT } = require("../me/me.painel");
const {
  ASSET_STATUS,
  ORDER_STATUS,
  QUOTE_STATUS,
  PICKUP_STATUS,
  PAYOUT_STATUS,
  MODELOS_COMERCIAIS,
} = require("../../config/constants");

const cent = (n) => Number(Number(n || 0).toFixed(2));

const ROTULO_QUOTE = {
  [QUOTE_STATUS.NOVA]: "Nova",
  [QUOTE_STATUS.EM_ATENDIMENTO]: "Em atendimento",
  [QUOTE_STATUS.RESPONDIDA]: "Respondida",
  [QUOTE_STATUS.ENCERRADA]: "Encerrada",
};

const ROTULO_PICKUP = {
  [PICKUP_STATUS.NAO_APLICAVEL]: "Não aplicável",
  [PICKUP_STATUS.AGUARDANDO]: "Aguardando retirada",
  [PICKUP_STATUS.AGENDADA]: "Retirada agendada",
  [PICKUP_STATUS.CONCLUIDA]: "Retirado",
};

function janela(query = {}) {
  const ate = query.ate ? new Date(query.ate) : new Date();
  if (query.desde) return { desde: new Date(query.desde), ate };
  const dias = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 }[query.periodo || "30d"];
  if (!dias) return { desde: null, ate };
  const desde = new Date(ate);
  desde.setDate(desde.getDate() - dias);
  return { desde, ate };
}

const entre = (campo, { desde, ate }) => (desde ? { [campo]: { [Op.between]: [desde, ate] } } : {});

/**
 * Comercial — Consultas.
 *
 * Area exclusiva da gestao RED. O fornecedor nao recebe, nao responde e nao ve
 * dados do comprador. A coluna "Responsável" e da equipa RED: consulta com dono
 * saiu da fila.
 */
async function consultas(query) {
  const { parsePagination } = require("../../utils/pagination");
  const { page, perPage, limit, offset } = parsePagination(query);
  const periodo = janela(query);

  const where = { ...entre("createdAt", periodo) };
  if (query.status) where.status = query.status;
  if (query.assignedTo) where.assignedTo = query.assignedTo;

  const r = await db.Quote.findAndCountAll({
    where,
    include: [
      { model: db.Asset, as: "ativo", attributes: ["id", "slug", "name"] },
      { model: db.User, as: "responsavel", attributes: ["id", "name"] },
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  return {
    rows: r.rows.map((q) => ({
      id: q.id,
      reference: q.reference,
      data: q.createdAt,
      cliente: q.company || q.buyerName,
      clienteContato: { nome: q.buyerName, email: q.buyerEmail, telefone: q.buyerPhone },
      ativo: q.ativo?.name || "—",
      assetId: q.assetId,
      quantidade: q.quantity,
      status: ROTULO_QUOTE[q.status],
      statusChave: q.status,
      responsavel: q.responsavel?.name || null,
      responsavelId: q.assignedTo,
      atualizacao: q.respondedAt || q.updatedAt,
    })),
    count: r.count,
    page,
    perPage,
  };
}

/** Cartoes do topo de Consultas: total e contagem por status, no periodo. */
async function resumoDeConsultas(query) {
  const periodo = janela(query);
  const linhas = await db.Quote.findAll({
    where: entre("createdAt", periodo),
    attributes: ["status", [fn("COUNT", col("id")), "total"]],
    group: ["status"],
    raw: true,
  });

  const por = Object.fromEntries(linhas.map((l) => [l.status, Number(l.total)]));
  const total = Object.values(por).reduce((a, b) => a + b, 0);

  const pct = (n) => (total ? Number(((n / total) * 100).toFixed(0)) : 0);
  const novas = por[QUOTE_STATUS.NOVA] || 0;
  const emAtendimento = por[QUOTE_STATUS.EM_ATENDIMENTO] || 0;
  const respondidas = por[QUOTE_STATUS.RESPONDIDA] || 0;
  const encerradas = por[QUOTE_STATUS.ENCERRADA] || 0;

  return {
    periodo,
    total,
    novas,
    emAtendimento,
    respondidas,
    encerradas,
    // Percentuais devolvidos prontos: a tela nao deve recalcular, senao duas
    // telas podem arredondar de formas diferentes.
    percentualRespondidas: pct(respondidas),
    percentualEncerradas: pct(encerradas),
  };
}

/**
 * Comercial — Ativos.
 *
 * Tabela global. Traz as duas receitas potenciais: a do fornecedor e a da RED.
 * E a mesma venda vista dos dois lados, e por isso o modelo vem com o
 * percentual ao lado — numero sem a regra que o gerou nao se audita.
 */
async function ativos(query) {
  const { parsePagination } = require("../../utils/pagination");
  const { page, perPage, limit, offset } = parsePagination(query);

  const where = {};
  if (query.status) where.status = query.status;
  if (query.commercialModel) where.commercialModel = query.commercialModel;
  if (query.supplierId) where.supplierId = query.supplierId;
  if (query.location) where.location = { [Op.iLike]: `%${query.location}%` };
  if (query.search) {
    const t = `%${query.search}%`;
    where[Op.or] = [{ name: { [Op.iLike]: t } }, { sku: { [Op.iLike]: t } }];
  }

  const include = [
    { model: db.Category, as: "categoria", attributes: ["id", "slug", "name"] },
    { model: db.Subcategory, as: "subcategoria", attributes: ["id", "slug", "name"] },
    { model: db.User, as: "fornecedor", attributes: ["id", "name", "companyTradeName"] },
    {
      model: db.AssetImage,
      as: "imagens",
      attributes: ["url"],
      separate: true,
      order: [["position", "ASC"]],
      limit: 1,
    },
  ];

  if (query.category) {
    const cat = await db.Category.findOne({ where: { slug: query.category } });
    if (cat) where.categoryId = cat.id;
  }

  const r = await db.Asset.findAndCountAll({
    where,
    include,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  // Todos os modelos do vocabulario, nao os dois que existiam quando isto foi
  // escrito: com a lista a mao, o ativo do modelo faltante vinha com
  // `participacaoFornecedor` undefined e a coluna de potencial dava NaN.
  const pct = Object.fromEntries(
    await Promise.all(
      Object.values(MODELOS_COMERCIAIS).map(async (m) => [m, await settings.percentualDoModelo(m)])
    )
  );

  const rows = r.rows.map((a) => {
    const participacao = pct[a.commercialModel];
    const bruto = cent(a.price) * a.quantity;
    return {
      id: a.id,
      codigo: a.sku,
      slug: a.slug,
      nome: a.name,
      imagem: a.imagens?.[0]?.url || null,
      fornecedor: a.fornecedor?.companyTradeName || a.fornecedor?.name || "—",
      fornecedorId: a.supplierId,
      categoria: a.categoria?.name || null,
      subcategoria: a.subcategoria?.name || null,
      local: a.location,
      condicao: a.condition,
      modelo: NOME_MODELO[a.commercialModel],
      modeloChave: a.commercialModel,
      preco: cent(a.price),
      precoMercado: a.marketPrice ? cent(a.marketPrice) : null,
      participacaoFornecedor: participacao,
      participacaoRed: 100 - participacao,
      potencialFornecedor: cent((bruto * participacao) / 100),
      potencialRed: cent((bruto * (100 - participacao)) / 100),
      quantidadeOriginal: a.originalQuantity,
      quantidadeDisponivel: a.quantity,
      status: ROTULO_ASSET[a.status],
      statusChave: a.status,
      publicadoEm: a.publishedAt,
      atualizadoEm: a.updatedAt,
    };
  });

  return { rows, count: r.count, page, perPage };
}

/**
 * Comercial — Vendas.
 *
 * Uma linha por VENDA (item de pedido), nao por pedido: e assim que a gestao
 * fala do negocio, e e a granularidade em que o repasse existe.
 *
 * O Comercial ve o necessario para compreender a venda. Receita liquida da RED
 * e comprovante de pagamento ficam fora — sao do Financeiro, e o perfil
 * comercial nao tem essa capacidade.
 */
async function vendas(query, { comFinanceiro = false } = {}) {
  const { parsePagination } = require("../../utils/pagination");
  const { page, perPage, limit, offset } = parsePagination(query);
  const periodo = janela(query);

  const where = { status: { [Op.ne]: PAYOUT_STATUS.CANCELADO }, ...entre("createdAt", periodo) };
  if (query.supplierId) where.supplierId = query.supplierId;
  if (query.commercialModel) where.commercialModel = query.commercialModel;
  if (query.status) where.status = query.status;

  const r = await db.Payout.findAndCountAll({
    where,
    include: [
      {
        model: db.Order,
        as: "pedido",
        attributes: ["id", "reference", "createdAt", "buyerName", "buyerEmail", "pickupStatus", "status"],
      },
      { model: db.OrderItem, as: "item", attributes: ["id", "nameSnapshot", "quantity", "unitPrice"] },
      { model: db.Asset, as: "ativo", attributes: ["id", "slug", "name", "sku", "categoryId"] },
      { model: db.User, as: "fornecedor", attributes: ["id", "name", "companyTradeName"] },
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  const rows = r.rows.map((p) => {
    const base = {
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
      valorBruto: cent(p.grossAmount),
      modelo: NOME_MODELO[p.commercialModel],
      modeloChave: p.commercialModel,
      participacaoFornecedor: Number(p.supplierPercent),
      statusRetirada: ROTULO_PICKUP[p.pedido?.pickupStatus],
      statusFinanceiro: ROTULO_PAYOUT[p.status],
      statusChave: p.status,
    };

    if (!comFinanceiro) return base;

    return {
      ...base,
      custos: cent(p.approvedCosts),
      valorLiquido: cent(p.netAmount),
      participacaoRed: Number(p.redPercent),
      repasse: cent(p.supplierAmount),
      receitaRed: cent(p.redAmount),
      prazo: p.dueAt,
      programadoPara: p.scheduledAt,
      pagoEm: p.paidAt,
      meioPagamento: p.paymentMethod,
      comprovante: p.paymentReference,
    };
  });

  return { rows, count: r.count, page, perPage };
}

/** Cartoes do topo de Vendas. Ticket medio sai daqui pronto. */
async function resumoDeVendas(query) {
  const periodo = janela(query);
  const where = { status: { [Op.ne]: PAYOUT_STATUS.CANCELADO }, ...entre("createdAt", periodo) };

  const [agg, aguardando] = await Promise.all([
    db.Payout.findOne({
      where,
      attributes: [
        [fn("COUNT", col("Payout.id")), "quantidade"],
        [fn("COALESCE", fn("SUM", col("gross_amount")), 0), "bruto"],
      ],
      raw: true,
    }),
    db.Order.count({ where: { pickupStatus: PICKUP_STATUS.AGUARDANDO } }),
  ]);

  const quantidade = Number(agg?.quantidade || 0);
  const bruto = cent(agg?.bruto);

  return {
    periodo,
    vendasRealizadas: quantidade,
    valorBrutoVendido: bruto,
    // Sem venda no periodo o ticket e null, nao zero: zero sugere venda de
    // valor nenhum, null diz que nao ha base para a media.
    ticketMedio: quantidade ? cent(bruto / quantidade) : null,
    aguardandoRetirada: aguardando,
  };
}

module.exports = { consultas, resumoDeConsultas, ativos, vendas, resumoDeVendas, janela, entre, cent };
