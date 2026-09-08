"use strict";

const { Op, fn, col, literal } = require("sequelize");
const db = require("../../models");
const payoutsService = require("../payouts/payouts.service");
const settings = require("../settings/settings.service");
const {
  ASSET_STATUS,
  PAYOUT_STATUS,
  QUOTE_STATUS,
  MODELOS_COMERCIAIS,
} = require("../../config/constants");

const cent = (n) => Number(Number(n || 0).toFixed(2));

/** Janela do filtro temporal. `tudo` nao tem inicio — e o acumulado. */
function janela(query = {}) {
  const ate = query.ate ? new Date(query.ate) : new Date();
  if (query.desde) return { desde: new Date(query.desde), ate };
  const dias = { "30d": 30, "90d": 90, "12m": 365 }[query.periodo || "30d"];
  if (!dias) return { desde: null, ate };
  const desde = new Date(ate);
  desde.setDate(desde.getDate() - dias);
  return { desde, ate };
}

/**
 * Receita potencial do fornecedor.
 *
 * Participacao dele sobre os ativos DISPONIVEIS ao preco vigente. E indicador
 * de ESTADO: nao aceita janela temporal, porque "receita potencial nos ultimos
 * 30 dias" nao e uma pergunta que faca sentido — o ativo esta publicado agora
 * ou nao esta.
 */
async function receitaPotencial(userId) {
  const linhas = await db.Asset.findAll({
    where: { supplierId: userId, status: ASSET_STATUS.PUBLICADO },
    attributes: [
      "commercialModel",
      [fn("COALESCE", fn("SUM", literal('"price" * "quantity"')), 0), "bruto"],
    ],
    group: ["commercialModel"],
    raw: true,
  });

  let total = 0;
  for (const l of linhas) {
    const pct = await settings.percentualDoModelo(l.commercialModel);
    total += (Number(l.bruto) * pct) / 100;
  }
  return cent(total);
}

/**
 * Dashboard de Vendas — os seis cartoes e os dois graficos numa chamada.
 *
 * A resposta separa `estado` de `fluxo` explicitamente. Nao e organizacao
 * estetica: e o contrato que impede a tela de aplicar o filtro de periodo a um
 * indicador que nao deve responder a ele.
 */
async function dashboard(userId, query) {
  const { desde, ate } = janela(query);
  const noPeriodo = (campo) => {
    if (!desde) return {};
    return { [campo]: { [Op.between]: [desde, ate] } };
  };

  const [publicados, potencial, carteira, vendidosNoPeriodo, realizadoNoPeriodo, recebidoNoPeriodo] =
    await Promise.all([
      db.Asset.count({ where: { supplierId: userId, status: ASSET_STATUS.PUBLICADO } }),
      receitaPotencial(userId),
      payoutsService.resumoDoFornecedor(userId),
      db.Payout.count({
        where: {
          supplierId: userId,
          status: { [Op.ne]: PAYOUT_STATUS.CANCELADO },
          ...noPeriodo("createdAt"),
        },
      }),
      db.Payout.sum("supplier_amount", {
        where: {
          supplierId: userId,
          status: { [Op.ne]: PAYOUT_STATUS.CANCELADO },
          ...noPeriodo("createdAt"),
        },
      }),
      db.Payout.sum("supplier_amount", {
        where: { supplierId: userId, status: PAYOUT_STATUS.PAGO, ...noPeriodo("paidAt") },
      }),
    ]);

  return {
    periodo: { desde, ate },
    // Fotografia do agora. Deliberadamente fora do filtro.
    estado: {
      ativosPublicados: publicados,
      receitaPotencial: potencial,
      aReceber: carteira.aReceber,
    },
    // Movimento do intervalo.
    fluxo: {
      ativosVendidos: vendidosNoPeriodo,
      vendasRealizadas: cent(realizadoNoPeriodo),
      recebido: cent(recebidoNoPeriodo),
    },
    graficos: {
      resultados: await serieDeResultados(userId, { desde, ate }),
      ativosPorStatus: await ativosPorStatus(userId),
    },
  };
}

/**
 * Grafico 1 — vendas realizadas x valores recebidos ao longo do tempo.
 *
 * O agrupamento acompanha a janela: dias para 30d, semanas para 90d, meses
 * para 12m. Um grafico de 365 pontos diarios nao se le.
 */
async function serieDeResultados(userId, { desde, ate }) {
  const dias = desde ? Math.ceil((ate - desde) / 86400000) : 365;
  const unidade = dias <= 31 ? "week" : dias <= 120 ? "week" : "month";
  const inicio = desde || new Date(ate.getTime() - 365 * 86400000);

  const agrupar = async (campoData, statusFiltro) => {
    const where = {
      supplierId: userId,
      [campoData]: { [Op.between]: [inicio, ate] },
      ...(statusFiltro ? { status: statusFiltro } : { status: { [Op.ne]: PAYOUT_STATUS.CANCELADO } }),
    };
    const linhas = await db.Payout.findAll({
      where,
      attributes: [
        [fn("DATE_TRUNC", unidade, col(campoData === "createdAt" ? "created_at" : "paid_at")), "balde"],
        [fn("COALESCE", fn("SUM", col("supplier_amount")), 0), "valor"],
      ],
      group: [literal("1")],
      order: [literal("1 ASC")],
      raw: true,
    });
    return new Map(linhas.map((l) => [new Date(l.balde).toISOString(), Number(l.valor)]));
  };

  const [realizado, recebido] = await Promise.all([
    agrupar("createdAt", null),
    agrupar("paidAt", PAYOUT_STATUS.PAGO),
  ]);

  // Baldes vazios entram com zero: um buraco no eixo faria a linha saltar e
  // sugerir um periodo sem operacao que na verdade so nao teve venda.
  const chaves = [...new Set([...realizado.keys(), ...recebido.keys()])].sort();
  return chaves.map((k) => {
    const d = new Date(k);
    return {
      rotulo:
        unidade === "month"
          ? d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")
          : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      data: k,
      realizado: cent(realizado.get(k) || 0),
      recebido: cent(recebido.get(k) || 0),
    };
  });
}

/** Grafico 2 — distribuicao do portfolio por status. Estado, sem filtro. */
async function ativosPorStatus(userId) {
  const linhas = await db.Asset.findAll({
    where: { supplierId: userId },
    attributes: ["status", [fn("COUNT", col("id")), "total"]],
    group: ["status"],
    raw: true,
  });

  const cor = {
    [ASSET_STATUS.PUBLICADO]: "#1a8a4a",
    [ASSET_STATUS.VENDIDO]: "#0b5fb0",
    [ASSET_STATUS.EM_AVALIACAO]: "#e0a11b",
    [ASSET_STATUS.AGUARDANDO_APROVACAO]: "#e0a11b",
    [ASSET_STATUS.INATIVO]: "#9aa2ae",
    [ASSET_STATUS.RASCUNHO]: "#9aa2ae",
    [ASSET_STATUS.APROVADO]: "#60a5fa",
  };
  const rotulo = {
    [ASSET_STATUS.PUBLICADO]: "Publicados",
    [ASSET_STATUS.VENDIDO]: "Vendidos",
    [ASSET_STATUS.EM_AVALIACAO]: "Em avaliação",
    [ASSET_STATUS.AGUARDANDO_APROVACAO]: "Aguardando aprovação",
    [ASSET_STATUS.INATIVO]: "Inativos",
    [ASSET_STATUS.RASCUNHO]: "Rascunhos",
    [ASSET_STATUS.APROVADO]: "Aprovados",
  };

  return linhas
    .map((l) => ({
      rotulo: rotulo[l.status] || l.status,
      chave: l.status,
      valor: Number(l.total),
      cor: cor[l.status] || "#9aa2ae",
    }))
    .sort((a, b) => b.valor - a.valor);
}

/**
 * Visao Geral da Area do Cliente.
 *
 * Resume os DOIS lados da relacao com a RED numa chamada — o front pinta a
 * pagina inteira sem encadear pedidos. "Recebido" nao entra no bloco Vender de
 * proposito: a Visao Geral resume, quem detalha dinheiro e o Financeiro.
 */
async function visaoGeral(userId) {
  const [compras, consultasAbertas, favoritos, publicados, vendidos, potencial, carteira, atividades] =
    await Promise.all([
      db.Order.count({ where: { buyerId: userId } }),
      // "Consultas" no bloco Comprar sao as ABERTAS — as que ainda esperam
      // retorno. Contar as encerradas inflaria o numero com o que ja acabou.
      db.Quote.count({
        where: {
          buyerId: userId,
          status: { [Op.in]: [QUOTE_STATUS.NOVA, QUOTE_STATUS.EM_ATENDIMENTO] },
        },
      }),
      db.Wishlist.count({ where: { userId } }),
      db.Asset.count({ where: { supplierId: userId, status: ASSET_STATUS.PUBLICADO } }),
      db.Asset.count({ where: { supplierId: userId, status: ASSET_STATUS.VENDIDO } }),
      receitaPotencial(userId),
      payoutsService.resumoDoFornecedor(userId),
      ultimasAtividades(userId),
    ]);

  return {
    comprar: { compras, consultas: consultasAbertas, favoritos },
    vender: {
      ativosPublicados: publicados,
      ativosVendidos: vendidos,
      receitaPotencial: potencial,
      aReceber: carteira.aReceber,
      recebido: carteira.recebido,
      vendasRealizadas: carteira.vendasRealizadas,
    },
    atividades,
  };
}

/**
 * Ultimas atividades.
 *
 * Sai das NOTIFICACOES, nao de uma consulta nova sobre pedidos e ativos: a
 * notificacao ja e o registo de "algo aconteceu e diz respeito a este
 * utilizador", ja tem link para o objeto, e ja respeita a permissao. Montar um
 * feed paralelo criaria duas fontes que podem divergir.
 */
async function ultimasAtividades(userId, limite = 5) {
  const linhas = await db.Notification.findAll({
    where: { userId },
    order: [["createdAt", "DESC"]],
    limit: limite,
  });

  return linhas.map((n) => ({
    id: n.id,
    titulo: n.title,
    detalhe: n.body,
    data: n.createdAt,
    href: n.link,
    lida: !!n.readAt,
  }));
}

module.exports = { dashboard, visaoGeral, receitaPotencial, ultimasAtividades, janela };
