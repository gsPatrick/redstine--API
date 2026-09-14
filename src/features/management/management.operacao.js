"use strict";

const { Op, fn, col, literal } = require("sequelize");
const db = require("../../models");
const { parsePagination } = require("../../utils/pagination");
const { AppError } = require("../../utils/app-error");
const { NOME_MODELO, ROTULO_ASSET } = require("../me/me.painel");
const { cent } = require("./management.comercial");
const {
  ASSET_STATUS,
  ORDER_STATUS,
  PICKUP_STATUS,
  MODELOS_COMERCIAIS,
  INVENTARIO_STATUS,
  STATUS_OPERACIONAL,
  ROTULO_STATUS_OPERACIONAL,
  ROTULO_CONDICAO,
  ROTULO_DISPONIBILIDADE,
  SLA_RETIRADA_DIAS,
  ESTOQUE_LONGO_DIAS,
} = require("../../config/constants");

/**
 * Operacao — inventario e fluxo fisico dos ativos.
 *
 * O que esta area responde: ONDE estao os ativos, em que condicao operacional
 * estao e o que precisa acontecer. Nao e um segundo painel de vendas: nao ha
 * aqui receita da RED, repasse, margem nem pagamento — nem por acidente. Note
 * que este ficheiro NAO importa o model Payout nem o servico de repasses: a
 * separacao de acesso comeca por nao ter o dado a mao.
 *
 * A distincao ESTADO x FLUXO do resto do painel vale igual, e aqui ela e ainda
 * mais literal: o inventario e ESTADO por definicao. "Ativos sob gestao nos
 * ultimos 7 dias" nao e uma pergunta — o ativo esta em inventario hoje ou nao
 * esta. Por isso os indicadores ignoram o filtro de periodo, e so a TABELA o
 * usa (para recortar o que entrou no inventario na janela).
 *
 * Dois indicadores que o cliente pediu NAO estao aqui, de proposito:
 *
 *   Localizacoes      — `assets.location` e texto livre e esta inconsistente
 *                       ("Rio de Janeiro/RJ" e "Rio de Janeiro — RJ" sao o
 *                       mesmo lugar em dois registos, e mais da metade dos
 *                       ativos tem o campo vazio). Distribuir por local em
 *                       cima disso produziria um grafico errado com cara de
 *                       certo. O lugar esta preparado: ver
 *                       `pendencias.semLocalizacao`, que mede exatamente o
 *                       tamanho do problema, e `pendentesDeDefinicao`.
 *   Aguardando entrada — nao existe no ciclo de vida o conceito de "ativo
 *                       recebido fisicamente". Sem saber quem carimba e
 *                       quando, o indicador seria uma contagem de ativos de
 *                       modelo `estoque` chamada de "nao recebida", o que e
 *                       chute, nao medida.
 */

/** Janela do inventario: sem periodo explicito, e TUDO — inventario nao e mes. */
function janelaDoInventario(query = {}) {
  const { janela } = require("./management.comercial");
  if (!query.periodo && !query.desde && !query.ate) return janela({ periodo: "tudo" });
  return janela(query);
}

/**
 * Data de referencia do "dias em estoque".
 *
 * `published_at` quando existe, `created_at` como recuo. O criterio:
 * publicacao e o momento em que o ativo entrou no inventario disponivel — e
 * a partir dai que "esta parado" significa algo, porque so a partir dai ele
 * podia ter saido. Um ativo `aprovado` ainda nao tem publicacao, e ai o
 * cadastro e a unica data que a RED controla.
 *
 * O que este numero NAO mede: a data de entrada FISICA no galpao. Essa data
 * nao existe no sistema (e o segundo indicador bloqueado). Para RED Catalogo
 * a distincao e menor — o ativo nunca entra na RED, fica com o fornecedor, e
 * "dias em catalogo" e a leitura correta. Para RED Estoque ha um intervalo
 * cego entre receber e publicar que este indicador nao ve.
 */
const EXPR_REFERENCIA = 'COALESCE("Asset"."published_at", "Asset"."created_at")';

/**
 * Fim da contagem: `sold_at` para o que foi vendido, agora para o resto.
 *
 * E a regra que o painel precisava: dias em estoque de um ativo vendido para
 * de contar no dia da venda. Sem o CASE, um ativo vendido em marco aparecia
 * hoje com "180 dias em estoque" e contaminava a media com tempo que o ativo
 * nao passou em estoque nenhum.
 */
const EXPR_FIM = `CASE WHEN "Asset"."status" = '${ASSET_STATUS.VENDIDO}' AND "Asset"."sold_at" IS NOT NULL THEN "Asset"."sold_at" ELSE NOW() END`;

const EXPR_DIAS = `FLOOR(EXTRACT(EPOCH FROM (${EXPR_FIM} - ${EXPR_REFERENCIA})) / 86400)`;

/**
 * Quem responde pelo ativo.
 *
 * `null` quando nao se sabe — a tela mostra "nao identificado" em vez de
 * inventar um dono. Ver a nota na montagem da linha.
 */
function proprietarioDe(a) {
  if (a.commercialModel === MODELOS_COMERCIAIS.PROPRIO) return "RED";
  return a.fornecedor?.companyTradeName || a.fornecedor?.name || null;
}

/** Mesmo calculo, em JS, para as linhas da tabela. Um so criterio, dois usos. */
function diasEmEstoque(ativo) {
  const inicio = ativo.publishedAt || ativo.createdAt;
  if (!inicio) return null;
  const fim =
    ativo.status === ASSET_STATUS.VENDIDO && ativo.soldAt ? new Date(ativo.soldAt) : new Date();
  return Math.max(0, Math.floor((fim - new Date(inicio)) / 86400000));
}

/** Pedidos que já são venda e cuja carga ainda não saiu. */
const ONDE_RETIRADA_PENDENTE = {
  pickupStatus: [PICKUP_STATUS.AGUARDANDO, PICKUP_STATUS.AGENDADA],
  status: { [Op.notIn]: [ORDER_STATUS.CANCELADO, ORDER_STATUS.AGUARDANDO_CONFIRMACAO] },
};

/**
 * Itens vendidos com retirada pendente.
 *
 * Sai de `order_items` + `orders`, NAO de `payouts`: a pergunta e fisica
 * ("o que ainda nao saiu"), e a tabela de repasses e financeira. Usar payouts
 * aqui daria ao perfil de Operacao uma leitura da tabela que guarda receita
 * RED e repasse — por uma porta que parecia operacional.
 */
async function itensComRetiradaPendente() {
  const limite = new Date(Date.now() - SLA_RETIRADA_DIAS * 86400000);

  const itens = await db.OrderItem.findAll({
    attributes: ["id", "assetId", "nameSnapshot", "quantity", "total"],
    include: [
      {
        model: db.Order,
        as: "pedido",
        required: true,
        attributes: ["id", "reference", "status", "pickupStatus", "pickupScheduledAt", "pickupLocation", "buyerName", "createdAt"],
        where: ONDE_RETIRADA_PENDENTE,
      },
    ],
  });

  const atrasado = (i) =>
    i.pedido.pickupStatus === PICKUP_STATUS.AGENDADA
      ? // Agendada com data no passado: o caminhao nao veio.
        !!i.pedido.pickupScheduledAt && new Date(i.pedido.pickupScheduledAt) < new Date()
      : // Aguardando ha mais de SLA_RETIRADA_DIAS: ninguem agendou.
        new Date(i.pedido.createdAt) < limite;

  return { itens, atrasado };
}

// ------------------------------------------------------------- filtros comuns

/** Recorte dimensional aplicado aos indicadores E à tabela, para concordarem. */
async function recorte(query = {}) {
  const where = {};
  if (query.commercialModel) where.commercialModel = query.commercialModel;
  if (query.supplierId) where.supplierId = query.supplierId;
  if (query.category) {
    const cat = await db.Category.findOne({ where: { slug: query.category } });
    // Categoria inexistente nao pode devolver o inventario inteiro como se o
    // filtro nao existisse — devolve vazio, que e a resposta honesta.
    where.categoryId = cat ? cat.id : "00000000-0000-0000-0000-000000000000";
  }
  return where;
}

const NO_INVENTARIO = { status: INVENTARIO_STATUS };

// ------------------------------------------------------------------ indicadores

/**
 * Os oito indicadores da area.
 *
 * Sao poucos de proposito. O cliente foi explicito: "sem criar 47 indicadores
 * e transformar o painel numa cabine de Boeing".
 */
async function indicadores(query = {}) {
  const filtro = await recorte(query);
  const base = { ...NO_INVENTARIO, ...filtro };

  const [inventario, porModelo, tempo, prontos, semLocal, semSaldo, pendencia, categorias] =
    await Promise.all([
      somaDe(base),
      somaPorModelo(filtro),
      tempoEmEstoque(base),
      db.Asset.count({ where: { ...filtro, status: ASSET_STATUS.APROVADO } }),
      // O tamanho do problema que bloqueia o indicador de Localizacoes. Fica
      // como pendencia porque e isso que e: dado operacional em falta.
      db.Asset.count({
        where: { ...base, [Op.or]: [{ location: null }, { location: "" }] },
      }),
      // Publicado com saldo zero: esta no catalogo e nao ha o que entregar.
      db.Asset.count({ where: { ...filtro, status: ASSET_STATUS.PUBLICADO, quantity: 0 } }),
      itensComRetiradaPendente(),
      inventarioPorCategoria(query),
    ]);

  const { itens, atrasado } = pendencia;
  const atrasados = itens.filter(atrasado);
  const ativosComRetirada = new Set(itens.map((i) => i.assetId).filter(Boolean));

  const retirada = {
    // Uma linha por item vendido, nao por pedido: e o item que se carrega.
    itens: itens.length,
    ativos: ativosComRetirada.size,
    unidades: itens.reduce((a, i) => a + Number(i.quantity || 0), 0),
    valor: cent(itens.reduce((a, i) => a + Number(i.total || 0), 0)),
    atrasados: atrasados.length,
    valorAtrasado: cent(atrasados.reduce((a, i) => a + Number(i.total || 0), 0)),
    slaDias: SLA_RETIRADA_DIAS,
  };

  const pendencias = {
    prontosParaPublicar: prontos,
    retiradasAtrasadas: atrasados.length,
    semLocalizacao: semLocal,
    publicadoSemSaldo: semSaldo,
    // O cartao "Pendencias operacionais" mostra UM numero; a lista abaixo
    // dele diz de que ele e feito. Somar no front faria duas telas chegarem a
    // dois totais diferentes.
    total: prontos + atrasados.length + semLocal + semSaldo,
  };

  return {
    periodo: { desde: null, ate: new Date() },
    // Tudo abaixo e ESTADO: fotografia de agora, imune ao filtro de periodo.
    inventario,
    porModelo,
    aguardandoRetirada: retirada,
    tempoEmEstoque: tempo,
    pendencias,
    graficos: { inventarioPorCategoria: categorias },
    /**
     * Contrato explicito do que ainda nao existe. A tela le isto para nao
     * inventar um cartao vazio, e quem for implementar sabe onde entra.
     */
    pendentesDeDefinicao: [
      {
        chave: "localizacoes",
        rotulo: "Localizações",
        motivo:
          "assets.location é texto livre e está inconsistente. Depende de virar lista fechada de locais.",
        medidaDoProblema: semLocal,
      },
      {
        chave: "aguardandoEntrada",
        rotulo: "Aguardando entrada",
        motivo:
          "não existe no ciclo de vida o registo de recebimento físico do ativo. Depende de definir quem marca e quando.",
        medidaDoProblema: null,
      },
    ],
  };
}

/** Quantidade de registos, de unidades e valor anunciado de um recorte. */
async function somaDe(where) {
  const linha = await db.Asset.findOne({
    where,
    attributes: [
      [fn("COUNT", col("id")), "registros"],
      [literal('COALESCE(SUM("quantity"), 0)'), "unidades"],
      // Valor ANUNCIADO do saldo: preco unitario x saldo disponivel. Usar a
      // quantidade original contaria de novo o que ja foi vendido.
      [literal('COALESCE(SUM("price" * "quantity"), 0)'), "valor"],
    ],
    raw: true,
  });

  return {
    registros: Number(linha?.registros || 0),
    unidades: Number(linha?.unidades || 0),
    valor: cent(linha?.valor),
  };
}

/**
 * RED Estoque x RED Catalogo x Ativos proprios.
 *
 * Os tres modelos, sempre, mesmo com zero registos: um modelo que desaparece
 * da resposta faz o cartao desaparecer da tela, e "nao ha ativo proprio" e uma
 * informacao — nao um cartao em falta.
 */
async function somaPorModelo(filtro) {
  const linhas = await db.Asset.findAll({
    where: { ...NO_INVENTARIO, ...filtro },
    attributes: [
      "commercialModel",
      [fn("COUNT", col("id")), "registros"],
      [literal('COALESCE(SUM("quantity"), 0)'), "unidades"],
      [literal('COALESCE(SUM("price" * "quantity"), 0)'), "valor"],
    ],
    group: ["commercialModel"],
    raw: true,
  });

  const por = Object.fromEntries(linhas.map((l) => [l.commercialModel, l]));

  return Object.values(MODELOS_COMERCIAIS).map((modelo) => {
    const l = por[modelo];
    return {
      modelo: NOME_MODELO[modelo],
      modeloChave: modelo,
      registros: Number(l?.registros || 0),
      unidades: Number(l?.unidades || 0),
      valor: cent(l?.valor),
      /** De quem e a guarda fisica. E a pergunta "onde esta o ativo". */
      guarda: modelo === MODELOS_COMERCIAIS.CATALOGO ? "fornecedor" : "red",
    };
  });
}

/** Media, mediana e cauda longa do tempo em inventario. */
async function tempoEmEstoque(where) {
  const linha = await db.Asset.findOne({
    where,
    attributes: [
      [literal(`ROUND(AVG(${EXPR_DIAS}))`), "media"],
      [literal(`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${EXPR_DIAS})`), "mediana"],
      [
        literal(`COUNT(*) FILTER (WHERE ${EXPR_DIAS} >= ${ESTOQUE_LONGO_DIAS})`),
        "longos",
      ],
      [
        literal(
          `COALESCE(SUM("Asset"."price" * "Asset"."quantity") FILTER (WHERE ${EXPR_DIAS} >= ${ESTOQUE_LONGO_DIAS}), 0)`
        ),
        "valorLongos",
      ],
    ],
    raw: true,
  });

  const numeroOuNulo = (v) => (v === null || v === undefined ? null : Number(v));

  return {
    // Sem inventario nao ha media: null, nao zero. Zero dia em estoque e uma
    // medida; "nao ha base" e outra coisa.
    mediaDias: numeroOuNulo(linha?.media),
    medianaDias: linha?.mediana === null || linha?.mediana === undefined ? null : Math.round(Number(linha.mediana)),
    limiteLongoDias: ESTOQUE_LONGO_DIAS,
    acimaDoLimite: {
      registros: Number(linha?.longos || 0),
      valor: cent(linha?.valorLongos),
    },
    referencia: "publicacao (ou cadastro, quando ainda nao publicado); para ativo vendido, para na data da venda",
  };
}

/**
 * Inventario por categoria.
 *
 * Dimensao ANALITICA, com o peso que o cliente deu: um grafico simples. E, de
 * proposito, uma pergunta diferente da de "vendas por categoria" do Comercial
 * — aqui e quanto ESTA parado por categoria, la e quanto SAIU. Os dois nomes
 * parecidos medem coisas opostas.
 */
async function inventarioPorCategoria(query = {}) {
  const filtro = await recorte(query);

  const linhas = await db.Asset.findAll({
    where: { ...NO_INVENTARIO, ...filtro },
    attributes: [
      [col("Asset.category_id"), "categoryId"],
      [col("categoria.name"), "categoria"],
      [fn("COUNT", col("Asset.id")), "registros"],
      [literal('COALESCE(SUM("Asset"."quantity"), 0)'), "unidades"],
      [literal('COALESCE(SUM("Asset"."price" * "Asset"."quantity"), 0)'), "valor"],
    ],
    include: [{ model: db.Category, as: "categoria", attributes: [] }],
    group: [col("Asset.category_id"), col("categoria.name")],
    raw: true,
  });

  const total = linhas.reduce((a, l) => a + Number(l.valor), 0);

  return linhas
    .map((l) => ({
      categoryId: l.categoryId,
      rotulo: l.categoria || "Sem categoria",
      registros: Number(l.registros),
      unidades: Number(l.unidades),
      valor: cent(l.valor),
      percentual: total ? Number(((Number(l.valor) / total) * 100).toFixed(0)) : 0,
    }))
    .sort((a, b) => b.valor - a.valor)
    .map((l, i) => ({ ...l, cor: CORES[i % CORES.length] }));
}

/** Mesma paleta dos outros graficos do painel: cor estavel entre recargas. */
const CORES = ["#1a8a4a", "#0b5fb0", "#e0a11b", "#8b929c", "#7c3aed", "#c40404"];

// ------------------------------------------------------- status operacional

/**
 * As regras do status operacional, em ordem de precedencia, UMA vez.
 *
 * Cada regra tem duas faces que precisam concordar sempre: `onde` (o que a
 * base filtra) e `vale` (o que a linha e rotulada). Escrever as duas no mesmo
 * lugar e o que evita o bug classico — o filtro "sem saldo" devolver linhas
 * rotuladas "em guarda", porque alguem mexeu num dos lados so.
 *
 * A precedencia importa: um ativo pode satisfazer mais de uma condicao, e a
 * primeira ganha. Retirada pendente vem antes de tudo porque e a unica que
 * exige acao hoje.
 */
const REGRAS = [
  {
    chave: STATUS_OPERACIONAL.AGUARDANDO_RETIRADA,
    onde: (ids) => ({ id: { [Op.in]: ids } }),
    vale: (a, comRetirada) => comRetirada.has(a.id),
  },
  {
    chave: STATUS_OPERACIONAL.PRONTO_PARA_PUBLICAR,
    onde: (ids) => ({ status: ASSET_STATUS.APROVADO, id: { [Op.notIn]: ids } }),
    vale: (a) => a.status === ASSET_STATUS.APROVADO,
  },
  {
    chave: STATUS_OPERACIONAL.SAIU_DO_INVENTARIO,
    onde: (ids) => ({ status: ASSET_STATUS.VENDIDO, id: { [Op.notIn]: ids } }),
    vale: (a) => a.status === ASSET_STATUS.VENDIDO,
  },
  {
    chave: STATUS_OPERACIONAL.SEM_SALDO,
    onde: (ids) => ({ status: ASSET_STATUS.PUBLICADO, quantity: 0, id: { [Op.notIn]: ids } }),
    vale: (a) => a.quantity === 0,
  },
  {
    chave: STATUS_OPERACIONAL.RESERVADO,
    onde: (ids) => ({
      status: ASSET_STATUS.PUBLICADO,
      availability: "reservado",
      quantity: { [Op.gt]: 0 },
      id: { [Op.notIn]: ids },
    }),
    vale: (a) => a.availability === "reservado",
  },
  {
    chave: STATUS_OPERACIONAL.EM_GUARDA_RED,
    onde: (ids) => ({
      status: ASSET_STATUS.PUBLICADO,
      commercialModel: [MODELOS_COMERCIAIS.ESTOQUE, MODELOS_COMERCIAIS.PROPRIO],
      availability: { [Op.ne]: "reservado" },
      quantity: { [Op.gt]: 0 },
      id: { [Op.notIn]: ids },
    }),
    vale: (a) => a.commercialModel !== MODELOS_COMERCIAIS.CATALOGO,
  },
  {
    chave: STATUS_OPERACIONAL.EM_CATALOGO,
    onde: (ids) => ({
      status: ASSET_STATUS.PUBLICADO,
      commercialModel: MODELOS_COMERCIAIS.CATALOGO,
      availability: { [Op.ne]: "reservado" },
      quantity: { [Op.gt]: 0 },
      id: { [Op.notIn]: ids },
    }),
    vale: () => true,
  },
];

const CHAVES_OPERACIONAIS = REGRAS.map((r) => r.chave);

function statusOperacionalDe(ativo, comRetirada) {
  const regra = REGRAS.find((r) => r.vale(ativo, comRetirada));
  return regra ? regra.chave : null;
}

// ------------------------------------------------------------------- tabela

/**
 * A tabela operacional — a ferramenta de trabalho da area.
 *
 * Escopo: o inventario (aprovado/publicado) MAIS o que foi vendido e ainda nao
 * saiu. Esse ultimo grupo nao esta no inventario (ja tem dono novo) mas ainda
 * e problema da Operacao, e deixa-lo de fora era esconder da tabela a unica
 * linha em que alguem tem de agir hoje.
 *
 * NAO ha coluna de receita RED, repasse, margem ou potencial. A tabela do
 * Comercial tem; esta nao pode ter.
 */
async function ativos(query = {}) {
  const { page, perPage, limit, offset } = parsePagination(query);
  const filtro = await recorte(query);
  const periodo = janelaDoInventario(query);

  const { itens, atrasado } = await itensComRetiradaPendente();
  const idsComRetirada = [...new Set(itens.map((i) => i.assetId).filter(Boolean))];
  const comRetirada = new Set(idsComRetirada);
  // O NOT IN de Postgres com lista vazia e um erro de sintaxe; um UUID
  // impossivel mantem a semantica ("nenhum") sem ramificar cada regra.
  const ids = idsComRetirada.length ? idsComRetirada : ["00000000-0000-0000-0000-000000000000"];

  const where = { ...filtro };

  if (query.statusOperacional) {
    const regra = REGRAS.find((r) => r.chave === query.statusOperacional);
    if (!regra) {
      throw AppError.badRequest("Status operacional desconhecido.", "UNKNOWN_OPERATION_STATUS", {
        disponiveis: CHAVES_OPERACIONAIS,
      });
    }
    Object.assign(where, regra.onde(ids));
  } else {
    where[Op.or] = [
      { status: INVENTARIO_STATUS },
      { id: { [Op.in]: ids } },
    ];
  }

  // O periodo recorta ENTRADA no inventario, nao o inventario: e a unica
  // leitura em que filtrar por data nao faz o estoque "encolher" sem motivo.
  if (periodo.desde) {
    where[Op.and] = [
      literal(
        `COALESCE("Asset"."published_at", "Asset"."created_at") BETWEEN '${periodo.desde.toISOString()}' AND '${periodo.ate.toISOString()}'`
      ),
    ];
  }

  if (query.search) {
    const t = `%${query.search}%`;
    const busca = [{ name: { [Op.iLike]: t } }, { sku: { [Op.iLike]: t } }, { location: { [Op.iLike]: t } }];
    // A busca entra em AND com o resto: somada ao Op.or do escopo ela
    // devolveria tudo que casa com o texto, inventario ou nao.
    where[Op.and] = [...(where[Op.and] || []), { [Op.or]: busca }];
  }

  const r = await db.Asset.findAndCountAll({
    where,
    include: [
      { model: db.Category, as: "categoria", attributes: ["id", "slug", "name"] },
      { model: db.User, as: "fornecedor", attributes: ["id", "name", "companyTradeName"] },
    ],
    order: [[literal('COALESCE("Asset"."published_at", "Asset"."created_at")'), "ASC"]],
    limit,
    offset,
    distinct: true,
  });

  const porAtivo = new Map();
  for (const i of itens) {
    if (!i.assetId) continue;
    const atual = porAtivo.get(i.assetId) || { unidades: 0, itens: 0, atrasados: 0 };
    atual.unidades += Number(i.quantity || 0);
    atual.itens += 1;
    if (atrasado(i)) atual.atrasados += 1;
    porAtivo.set(i.assetId, atual);
  }

  const rows = r.rows.map((a) => {
    const chave = statusOperacionalDe(a, comRetirada);
    const retirada = porAtivo.get(a.id) || null;

    return {
      id: a.id,
      codigo: a.sku,
      slug: a.slug,
      nome: a.name,
      /**
       * Proprietario, nao "fornecedor": no modelo PROPRIO nao ha terceiro, o
       * dono e a RED, e a coluna com "—" ali fazia parecer cadastro incompleto.
       *
       * So o modelo PROPRIO vira "RED". Um ativo de CATALOGO sem fornecedor
       * gravado nao e da RED — e um cadastro incompleto, e chamar-lhe RED
       * produzia a linha contraditoria que apareceu na tela: proprietario
       * "RED", guarda "do fornecedor", status "No fornecedor". Que fornecedor?
       * Devolver `null` faz a tela dizer "nao identificado", que e a verdade e
       * e accionavel: nao ha a quem ligar para mover este ativo.
       */
      proprietario: proprietarioDe(a),
      proprietarioId: a.supplierId,
      proprioDaRed: a.commercialModel === MODELOS_COMERCIAIS.PROPRIO,
      modelo: NOME_MODELO[a.commercialModel],
      modeloChave: a.commercialModel,
      guarda: a.commercialModel === MODELOS_COMERCIAIS.CATALOGO ? "fornecedor" : "red",
      categoria: a.categoria?.name || null,
      categoriaSlug: a.categoria?.slug || null,
      /** Texto livre, como esta na base. Ver a nota sobre Localizacoes. */
      local: a.location || null,
      condicao: ROTULO_CONDICAO[a.condition] || null,
      quantidade: a.quantity,
      quantidadeOriginal: a.originalQuantity,
      unidade: a.unit,
      /** Valor anunciado do saldo. Nao ha aqui nenhuma parte de ninguem. */
      valor: cent(Number(a.price || 0) * a.quantity),
      precoUnitario: cent(a.price),
      statusOperacional: ROTULO_STATUS_OPERACIONAL[chave] || "—",
      statusOperacionalChave: chave,
      disponibilidade: ROTULO_DISPONIBILIDADE[a.availability] || null,
      statusCicloDeVida: ROTULO_ASSET[a.status],
      statusCicloDeVidaChave: a.status,
      diasEmEstoque: diasEmEstoque(a),
      referenciaEstoque: a.publishedAt || a.createdAt,
      /** Só existe quando há: a tela mostra "3 un. a retirar" em vez de zero. */
      retiradaPendente: retirada,
      atualizadoEm: a.updatedAt,
    };
  });

  return { rows, count: r.count, page, perPage };
}

/**
 * Detalhe operacional de um ativo — o que a acao da tabela abre.
 *
 * Junta numa vista o que a Operacao precisa para agir: guarda, saldo, tempo
 * parado e as retiradas pendentes com pedido, comprador e agendamento. Sem
 * nada financeiro: o valor que aparece e o anunciado, o mesmo da tabela.
 */
async function detalhe(id) {
  const a = await db.Asset.findByPk(id, {
    include: [
      { model: db.Category, as: "categoria", attributes: ["id", "slug", "name"] },
      { model: db.Subcategory, as: "subcategoria", attributes: ["id", "name"] },
      { model: db.User, as: "fornecedor", attributes: ["id", "name", "companyTradeName", "phone", "city", "state"] },
    ],
  });
  if (!a) throw AppError.notFound("Ativo não encontrado.", "ASSET_NOT_FOUND");

  const { itens, atrasado } = await itensComRetiradaPendente();
  const meus = itens.filter((i) => i.assetId === a.id);
  const comRetirada = new Set(meus.length ? [a.id] : []);
  const chave = statusOperacionalDe(a, comRetirada);

  return {
    id: a.id,
    codigo: a.sku,
    nome: a.name,
    categoria: a.categoria?.name || null,
    subcategoria: a.subcategoria?.name || null,
    modelo: NOME_MODELO[a.commercialModel],
    modeloChave: a.commercialModel,
    guarda: a.commercialModel === MODELOS_COMERCIAIS.CATALOGO ? "fornecedor" : "red",
    proprietario: proprietarioDe(a),
    contatoDaGuarda:
      a.commercialModel === MODELOS_COMERCIAIS.CATALOGO
        ? {
            nome: a.fornecedor?.companyTradeName || a.fornecedor?.name || null,
            telefone: a.fornecedor?.phone || null,
            cidade: [a.fornecedor?.city, a.fornecedor?.state].filter(Boolean).join(" - ") || null,
          }
        : null,
    local: a.location || null,
    condicao: ROTULO_CONDICAO[a.condition] || null,
    quantidade: a.quantity,
    quantidadeOriginal: a.originalQuantity,
    quantidadeVendida: Math.max(0, (a.originalQuantity || 0) - (a.quantity || 0)),
    unidade: a.unit,
    valor: cent(Number(a.price || 0) * a.quantity),
    statusOperacional: ROTULO_STATUS_OPERACIONAL[chave] || "—",
    statusOperacionalChave: chave,
    statusCicloDeVida: ROTULO_ASSET[a.status],
    diasEmEstoque: diasEmEstoque(a),
    referenciaEstoque: a.publishedAt || a.createdAt,
    retiradas: meus.map((i) => ({
      itemId: i.id,
      pedido: `#${i.pedido.reference}`,
      orderId: i.pedido.id,
      comprador: i.pedido.buyerName,
      quantidade: i.quantity,
      localRetirada: i.pedido.pickupLocation || null,
      agendadaPara: i.pedido.pickupScheduledAt,
      situacao:
        i.pedido.pickupStatus === PICKUP_STATUS.AGENDADA ? "Retirada agendada" : "Aguardando retirada",
      atrasada: atrasado(i),
      vendaEm: i.pedido.createdAt,
    })),
  };
}

module.exports = {
  indicadores,
  inventarioPorCategoria,
  ativos,
  detalhe,
  // Exportados para os testes: o criterio do "dias em estoque" e a tabela de
  // status operacional sao regra de negocio, e regra de negocio tem teste.
  diasEmEstoque,
  statusOperacionalDe,
  janelaDoInventario,
  CHAVES_OPERACIONAIS,
  REGRAS,
};
