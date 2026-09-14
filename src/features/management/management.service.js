"use strict";

const { Op, fn, col, literal } = require("sequelize");
const db = require("../../models");
const payoutsService = require("../payouts/payouts.service");
const {
  ASSET_STATUS,
  ORDER_STATUS,
  QUOTE_STATUS,
  SUBMISSION_STATUS,
  PAYOUT_STATUS,
  EVENTOS,
  PRAZO_REPASSE_HORAS,
  CAPABILITIES,
} = require("../../config/constants");

/**
 * Painel de gestao (documento oficial, secoes 18 a 22).
 *
 * A distincao que estrutura este arquivo inteiro:
 *
 *   ESTADO  — quanto existe AGORA (ativos publicados, receita potencial,
 *             valor a repassar). NAO responde ao filtro de periodo: "ativos
 *             publicados no ultimo mes" nao e uma pergunta que faca sentido,
 *             o ativo esta publicado hoje ou nao esta.
 *   FLUXO   — quanto ACONTECEU no intervalo (vendas realizadas, receita
 *             reconhecida, consultas recebidas). Responde ao filtro.
 *
 * Misturar os dois e o erro classico de dashboard: o gestor filtra "ultimos
 * 7 dias" e ve o estoque encolher, como se ativos tivessem sumido.
 */

const cent = (n) => Number(Number(n || 0).toFixed(2));

/** Traduz o filtro de periodo para uma janela concreta. */
function janela(query = {}) {
  const fim = query.ate ? new Date(query.ate) : new Date();
  if (query.desde) return { desde: new Date(query.desde), ate: fim };

  const dias = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 }[query.periodo || "30d"];
  if (!dias) return { desde: null, ate: fim }; // periodo=tudo
  const desde = new Date(fim);
  desde.setDate(desde.getDate() - dias);
  return { desde, ate: fim };
}

const noIntervalo = (campo, { desde, ate }) => {
  const cond = {};
  if (desde) cond[Op.gte] = desde;
  if (ate) cond[Op.lte] = ate;
  return Object.getOwnPropertySymbols(cond).length ? { [campo]: cond } : {};
};

/**
 * Pedidos que contam como venda: tudo que ja passou da confirmacao.
 * Fica de fora o que ainda nao virou venda (aguardando confirmacao) e o que
 * deixou de ser (cancelado) — listar por exclusao evita que um estado novo
 * no meio do fluxo desapareca silenciosamente do faturamento.
 */
const VENDAS = Object.values(ORDER_STATUS).filter(
  (s) => s !== ORDER_STATUS.AGUARDANDO_CONFIRMACAO && s !== ORDER_STATUS.CANCELADO
);

// ---------------------------------------------------------------- Visao geral

/**
 * Visao Geral — saude global, NAO uma quarta area.
 *
 * O cliente foi explicito: "escolhe 2 ou 3 KPIs criticos de cada area e
 * apresenta a saude global". Entao esta funcao devolve tres blocos pequenos
 * (comercial, operacao, financeiro), e nao a uniao de tudo o que cada area
 * sabe — a versao anterior somava seis indicadores de duas areas e ainda assim
 * nao respondia "como esta o negocio".
 *
 * E cada bloco so vem se o utilizador tiver a capacidade da area.
 *
 * Isto e correcao, nao politica nova: antes a rota exigia apenas
 * `commercial_read` e devolvia `financeiro.receitaRed` e `aRepassar` dentro do
 * mesmo payload — ou seja, o perfil Comercial lia receita da RED e repasse
 * pela Visao Geral, exatamente o que a regra de negocio proibe e o que o teste
 * da area financeira protegia nas outras rotas. O bloqueio por rota nao servia
 * aqui porque o problema era o CONTEUDO de uma rota que tres areas partilham.
 */
async function visaoGeral(query, capacidades = []) {
  const periodo = janela(query);
  const pode = (c) => capacidades.includes(c);

  const resposta = {
    periodo: { desde: periodo.desde, ate: periodo.ate },
    // A tela precisa saber que blocos existem nesta sessao para nao renderizar
    // um titulo de area sem cartoes debaixo.
    areas: [],
  };

  // Repasses fora do prazo e numero financeiro. Fica numa variavel propria
  // porque dois blocos o querem e a capacidade que o libera e uma so.
  let repassesForaDoPrazo = null;
  if (pode(CAPABILITIES.FINANCIAL_READ)) {
    const [fin, vencidos] = await Promise.all([
      payoutsService.resumoDaPlataforma(),
      db.Payout.count({
        where: {
          status: [PAYOUT_STATUS.A_RECEBER, PAYOUT_STATUS.PAGAMENTO_PROGRAMADO],
          dueAt: { [Op.lt]: new Date() },
        },
      }),
    ]);
    repassesForaDoPrazo = vencidos;

    resposta.areas.push("financeiro");
    resposta.financeiro = {
      receitaRed: fin.receitaRed,
      aRepassar: fin.aRepassar,
      repassado: fin.repassado,
      repassesForaDoPrazo: vencidos,
      prazoRepasseHoras: PRAZO_REPASSE_HORAS,
    };
  }

  if (pode(CAPABILITIES.COMMERCIAL_READ)) {
    const relatorios = require("./management.relatorios");
    const [fluxo, anterior, pendentes, estado, evolucao] = await Promise.all([
      indicadoresDeFluxo(periodo),
      // O periodo imediatamente anterior, do mesmo tamanho: e a unica base
      // honesta para "+22% vs período anterior".
      indicadoresDeFluxo(periodoAnterior(periodo)),
      alertasComerciais(),
      indicadoresDeEstado(),
      relatorios.evolucaoDeVendas(
        { periodo: "12m" },
        { comFinanceiro: pode(CAPABILITIES.FINANCIAL_READ) }
      ),
    ]);

    resposta.areas.unshift("comercial");
    resposta.comercial = {
      // FLUXO — responde ao filtro.
      valorVendido: fluxo.valorVendido,
      vendasRealizadas: fluxo.vendasRealizadas,
      ticketMedio: fluxo.ticketMedio,
      // ESTADO — o que esta parado a espera de alguem.
      consultasEmAberto: pendentes.consultasEmAberto,
      ativosAguardandoAprovacao: pendentes.ativosAguardandoAprovacao,
      enviosSemAvaliacao: pendentes.enviosSemAvaliacao,
      variacoes: {
        valorVendido: variacao(fluxo.valorVendido, anterior.valorVendido),
        vendasRealizadas: variacao(fluxo.vendasRealizadas, anterior.vendasRealizadas),
      },
    };
    resposta.graficos = { evolucaoVendas: evolucao };

    // `estado`, `fluxo` e `alertas` continuam no payload porque as telas de
    // Comercial (Ativos, Vendas) leem daqui os proprios cartoes. A Visao Geral
    // deixou de os mostrar; a rota nao deixou de os servir.
    resposta.estado = estado;
    resposta.fluxo = fluxo;
    resposta.alertas = {
      ...pendentes,
      ...(repassesForaDoPrazo === null ? {} : { repassesForaDoPrazo }),
      prazoRepasseHoras: PRAZO_REPASSE_HORAS,
    };
  }

  if (pode(CAPABILITIES.OPERATION_READ)) {
    const operacao = require("./management.operacao");
    // Sem filtro: o inventario e ESTADO, e a Visao Geral pergunta "quanto ha
    // agora", nao "quanto entrou no periodo".
    const ind = await operacao.indicadores({});

    // Depois do comercial e antes do financeiro — a ordem das areas no menu.
    const posicao = resposta.areas.indexOf("financeiro");
    resposta.areas.splice(posicao === -1 ? resposta.areas.length : posicao, 0, "operacao");
    resposta.operacao = {
      ativosSobGestao: ind.inventario.registros,
      unidadesSobGestao: ind.inventario.unidades,
      valorDoInventario: ind.inventario.valor,
      aguardandoRetirada: ind.aguardandoRetirada.itens,
      valorAguardandoRetirada: ind.aguardandoRetirada.valor,
      pendenciasOperacionais: ind.pendencias.total,
    };
  }

  return resposta;
}

/** Intervalo imediatamente anterior, com a mesma duracao. */
function periodoAnterior({ desde, ate }) {
  if (!desde) return { desde: null, ate: null };
  const duracao = ate - desde;
  return { desde: new Date(desde.getTime() - duracao), ate: new Date(desde) };
}

/**
 * Variacao percentual contra o periodo anterior.
 *
 * Sem base anterior devolve `null`, nao 0% nem +100%: crescer de zero para
 * qualquer coisa nao tem percentual, e exibir "+100%" ali seria inventar um
 * numero que a tela apresentaria como medida.
 */
function variacao(atual, anterior) {
  if (!anterior) return null;
  return Number((((atual - anterior) / anterior) * 100).toFixed(0));
}

async function indicadoresDeEstado() {
  const [publicados, emCuradoria, aguardandoAprovacao, vendidos, fornecedores, compradores] =
    await Promise.all([
      db.Asset.count({ where: { status: ASSET_STATUS.PUBLICADO } }),
      db.Submission.count({
        where: { status: [SUBMISSION_STATUS.RECEBIDA, SUBMISSION_STATUS.EM_AVALIACAO] },
      }),
      db.Asset.count({ where: { status: ASSET_STATUS.AGUARDANDO_APROVACAO } }),
      db.Asset.count({ where: { status: ASSET_STATUS.VENDIDO } }),
      // "Fornecedores ativos" e quem tem pelo menos um ativo PUBLICADO — nao
      // quem tem cadastro. Um fornecedor cujo unico ativo foi vendido nao esta
      // ativo hoje, e contar o cadastro inflaria o indicador para sempre.
      db.Asset.count({
        distinct: true,
        col: "supplier_id",
        where: { status: ASSET_STATUS.PUBLICADO, supplierId: { [Op.ne]: null } },
      }),
      db.Order.count({ distinct: true, col: "buyer_id" }),
    ]);

  // Valor total publicado = soma do valor bruto atualmente anunciado (secao 5
  // do documento). E estado: muda quando o catalogo muda, nao quando o periodo
  // muda. Nao confundir com a receita potencial do FORNECEDOR, que e a parte
  // dele sobre este mesmo valor.
  const linha = await db.Asset.findOne({
    where: { status: ASSET_STATUS.PUBLICADO },
    attributes: [[literal('COALESCE(SUM("price" * "quantity"), 0)'), "potencial"]],
    raw: true,
  });
  const potencial = linha?.potencial;

  return {
    ativosPublicados: publicados,
    ativosEmCuradoria: emCuradoria,
    ativosAguardandoAprovacao: aguardandoAprovacao,
    ativosVendidos: vendidos,
    fornecedoresAtivos: fornecedores,
    compradores,
    valorTotalPublicado: cent(potencial),
  };
}

async function indicadoresDeFluxo(periodo) {
  const emCreated = noIntervalo("createdAt", periodo);

  const [vendas, consultas, envios, publicacoes] = await Promise.all([
    db.Order.findOne({
      where: { status: VENDAS, ...emCreated },
      attributes: [
        [fn("COUNT", col("id")), "quantidade"],
        [fn("COALESCE", fn("SUM", col("total")), 0), "valor"],
      ],
      raw: true,
    }),
    db.Quote.count({ where: emCreated }),
    db.Submission.count({ where: emCreated }),
    db.Asset.count({ where: noIntervalo("publishedAt", periodo) }),
  ]);

  const concluidas = await db.Order.count({
    where: noIntervalo("operationCompletedAt", periodo),
  });

  const bruto = cent(vendas?.valor);
  const quantidade = Number(vendas?.quantidade || 0);

  return {
    vendasRealizadas: quantidade,
    valorVendido: bruto,
    ticketMedio: quantidade ? cent(bruto / quantidade) : 0,
    consultasRecebidas: consultas,
    enviosRecebidos: envios,
    ativosPublicados: publicacoes,
    operacoesConcluidas: concluidas,
  };
}

/**
 * O que exige acao humana hoje, do lado COMERCIAL. Nada aqui e filtravel por
 * periodo.
 *
 * `repassesForaDoPrazo` saiu daqui: e numero financeiro, e devolve-lo junto com
 * os comerciais obrigava a rota a escolher entre vazar o dado ou recusar o
 * perfil comercial inteiro. Quem o quer soma-o de fora, atras da capacidade
 * financeira.
 */
async function alertasComerciais() {
  const [curadoriaParada, aprovacaoPendente, consultasSemResposta] = await Promise.all([
    db.Submission.count({ where: { status: SUBMISSION_STATUS.RECEBIDA } }),
    db.Asset.count({ where: { status: ASSET_STATUS.AGUARDANDO_APROVACAO } }),
    db.Quote.count({ where: { status: [QUOTE_STATUS.NOVA, QUOTE_STATUS.EM_ATENDIMENTO] } }),
  ]);

  return {
    enviosSemAvaliacao: curadoriaParada,
    ativosAguardandoAprovacao: aprovacaoPendente,
    consultasEmAberto: consultasSemResposta,
  };
}

// ----------------------------------------------------------------- Comercial

async function comercial(query) {
  const periodo = janela(query);
  const emCreated = noIntervalo("createdAt", periodo);

  const [porCategoria, funil, consultasPorStatus, maisVistos, maisFavoritados] = await Promise.all([
    vendasPorCategoria(periodo),
    funilDoPeriodo(periodo),
    db.Quote.findAll({
      where: emCreated,
      attributes: ["status", [fn("COUNT", col("id")), "total"]],
      group: ["status"],
      raw: true,
    }),
    rankingPorEvento(EVENTOS.PRODUCT_VIEW, periodo),
    rankingPorEvento(EVENTOS.FAVORITE_ADDED, periodo),
  ]);

  return {
    periodo: { desde: periodo.desde, ate: periodo.ate },
    vendasPorCategoria: porCategoria,
    funil,
    consultasPorStatus: consultasPorStatus.map((l) => ({
      status: l.status,
      total: Number(l.total),
    })),
    maisVistos,
    maisFavoritados,
  };
}

async function vendasPorCategoria(periodo) {
  const linhas = await db.OrderItem.findAll({
    attributes: [
      [col("ativo.category_id"), "categoryId"],
      [col("ativo->categoria.name"), "categoria"],
      [fn("COUNT", col("OrderItem.id")), "itens"],
      [fn("COALESCE", fn("SUM", col("OrderItem.total")), 0), "valor"],
    ],
    include: [
      {
        model: db.Asset,
        as: "ativo",
        attributes: [],
        required: true,
        include: [{ model: db.Category, as: "categoria", attributes: [] }],
      },
      {
        model: db.Order,
        as: "pedido",
        attributes: [],
        required: true,
        where: { status: VENDAS, ...noIntervalo("createdAt", periodo) },
      },
    ],
    group: [col("ativo.category_id"), col("ativo->categoria.name")],
    raw: true,
  });

  return linhas
    .map((l) => ({
      categoryId: l.categoryId,
      categoria: l.categoria,
      itens: Number(l.itens),
      valor: cent(l.valor),
    }))
    .sort((a, b) => b.valor - a.valor);
}

/**
 * Funil visita -> favorito -> consulta -> compra.
 *
 * Sai da tabela de eventos, nao das tabelas de negocio: e a unica fonte que
 * enxerga o topo do funil (quem olhou e nao comprou).
 */
async function funilDoPeriodo(periodo) {
  const where = noIntervalo("occurredAt", periodo);

  const linhas = await db.Event.findAll({
    where: {
      ...where,
      type: [
        EVENTOS.PRODUCT_VIEW,
        EVENTOS.FAVORITE_ADDED,
        EVENTOS.CONSULTATION_CREATED,
        EVENTOS.PURCHASE_COMPLETED,
      ],
    },
    attributes: ["type", [fn("COUNT", col("id")), "total"]],
    group: ["type"],
    raw: true,
  });

  const por = Object.fromEntries(linhas.map((l) => [l.type, Number(l.total)]));
  const visitas = por[EVENTOS.PRODUCT_VIEW] || 0;
  const compras = por[EVENTOS.PURCHASE_COMPLETED] || 0;

  return {
    visitas,
    favoritos: por[EVENTOS.FAVORITE_ADDED] || 0,
    consultas: por[EVENTOS.CONSULTATION_CREATED] || 0,
    compras,
    // Percentual so faz sentido com base: sem visita nao ha taxa, ha divisao
    // por zero disfarcada de 0%.
    conversao: visitas ? Number(((compras / visitas) * 100).toFixed(2)) : null,
  };
}

async function rankingPorEvento(tipo, periodo, limite = 10) {
  const linhas = await db.Event.findAll({
    where: { type: tipo, assetId: { [Op.ne]: null }, ...noIntervalo("occurredAt", periodo) },
    attributes: ["assetId", [fn("COUNT", col("Event.id")), "total"]],
    include: [{ model: db.Asset, as: "ativo", attributes: ["name", "slug", "status"] }],
    group: ["Event.asset_id", "ativo.id"],
    order: [[literal('"total"'), "DESC"]],
    limit: limite,
    raw: true,
    nest: true,
  });

  return linhas.map((l) => ({
    assetId: l.assetId,
    nome: l.ativo?.name,
    slug: l.ativo?.slug,
    status: l.ativo?.status,
    total: Number(l.total),
  }));
}

// ----------------------------------------------------------------- Financeiro

/**
 * Visao financeira. Separada porque o acesso e separado: exige capacidade
 * financeira, e a rota recusa mesmo com token valido de outro perfil.
 */
async function financeiro(query) {
  const periodo = janela(query);

  const [estado, doPeriodo, vencendo, porModelo] = await Promise.all([
    payoutsService.resumoDaPlataforma(),
    payoutsService.resumoDaPlataforma({ desde: periodo.desde }),
    repassesNoPrazo(),
    resultadoPorModelo(periodo),
  ]);

  return {
    periodo: { desde: periodo.desde, ate: periodo.ate },
    // Posicao acumulada: quanto a RED tem a pagar e ja pagou, hoje.
    posicao: {
      aRepassar: estado.aRepassar,
      repassado: estado.repassado,
      receitaRedAcumulada: estado.receitaRed,
    },
    // Movimento do intervalo.
    periodoValores: doPeriodo,
    repasses: vencendo,
    porModeloComercial: porModelo,
  };
}

async function repassesNoPrazo() {
  const agora = new Date();
  const em24h = new Date(agora.getTime() + 24 * 60 * 60 * 1000);
  const devidos = {
    status: [PAYOUT_STATUS.A_RECEBER, PAYOUT_STATUS.PAGAMENTO_PROGRAMADO],
  };

  const [vencidos, vencendoHoje, total] = await Promise.all([
    db.Payout.sum("supplier_amount", {
      where: { ...devidos, dueAt: { [Op.lt]: agora } },
    }),
    db.Payout.sum("supplier_amount", {
      where: { ...devidos, dueAt: { [Op.between]: [agora, em24h] } },
    }),
    db.Payout.count({ where: devidos }),
  ]);

  return {
    pendentes: total,
    valorVencido: cent(vencidos),
    valorVencendoEm24h: cent(vencendoHoje),
  };
}

/** RED Estoque x RED Catalogo: os dois modelos tem margens diferentes. */
async function resultadoPorModelo(periodo) {
  const linhas = await db.Payout.findAll({
    where: noIntervalo("createdAt", periodo),
    attributes: [
      "commercialModel",
      [fn("COUNT", col("id")), "operacoes"],
      [fn("COALESCE", fn("SUM", col("gross_amount")), 0), "bruto"],
      [fn("COALESCE", fn("SUM", col("approved_costs")), 0), "custos"],
      [fn("COALESCE", fn("SUM", col("net_amount")), 0), "liquido"],
      [fn("COALESCE", fn("SUM", col("red_amount")), 0), "red"],
      [fn("COALESCE", fn("SUM", col("supplier_amount")), 0), "fornecedor"],
    ],
    group: ["commercialModel"],
    raw: true,
  });

  return linhas.map((l) => {
    const liquido = cent(l.liquido);
    return {
      modelo: l.commercialModel,
      operacoes: Number(l.operacoes),
      valorBruto: cent(l.bruto),
      custosAprovados: cent(l.custos),
      valorLiquido: liquido,
      receitaRed: cent(l.red),
      valorFornecedores: cent(l.fornecedor),
      margemRed: liquido ? Number(((Number(l.red) / liquido) * 100).toFixed(2)) : null,
    };
  });
}

module.exports = { visaoGeral, comercial, financeiro, janela };
