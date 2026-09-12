"use strict";

const { Op, fn, col } = require("sequelize");
const db = require("../../models");
const { AppError } = require("../../utils/app-error");
const { slugUnico } = require("../../utils/slug");
const { paraCatalogo } = require("./assets.catalogo");
const audit = require("../audit/audit.service");
const eventos = require("../events/events.service");
const notificacoes = require("../notifications/notifications.service");
const { parsePagination } = require("../../utils/pagination");
const {
  ASSET_STATUS,
  ASSET_TRANSICOES,
  ORDER_STATUS,
  MODALIDADES,
  CAMPOS_TECNICOS,
  ROTULO_CONDICAO,
  ROTULO_FORMA_VENDA,
  ROTULO_DISPONIBILIDADE,
} = require("../../config/constants");

const INCLUDES = () => [
  { model: db.Category, as: "categoria", attributes: ["id", "slug", "name"] },
  { model: db.Subcategory, as: "subcategoria", attributes: ["id", "slug", "name"] },
  {
    model: db.AssetImage,
    as: "imagens",
    attributes: ["id", "url", "alt", "position"],
    separate: true,
    order: [["position", "ASC"]],
  },
];

/** Acrescenta o desconto calculado — o cliente nao deve refazer essa conta. */
function comDesconto(asset) {
  const json = asset.toJSON();
  json.discountPercent = asset.descontoPercentual();

  // Rotulos legiveis vao junto: o card do catalogo mostra "Usado em bom
  // estado", nao "usado_bom", e traduzir no front espalharia o mesmo mapa por
  // varias telas.
  json.conditionLabel = ROTULO_CONDICAO[json.condition] || null;
  json.saleFormatLabel = ROTULO_FORMA_VENDA[json.saleFormat] || null;
  json.availabilityLabel = ROTULO_DISPONIBILIDADE[json.availability] || null;

  // So os campos tecnicos preenchidos — a ficha nao lista campo vazio.
  json.technical = CAMPOS_TECNICOS.filter((c) => json.attributes?.[c]).map((c) => ({
    campo: c,
    valor: json.attributes[c],
  }));

  return json;
}

function montarFiltros(query, { somentePublicados }) {
  const where = {};

  if (somentePublicados) {
    where.status = ASSET_STATUS.PUBLICADO;
  } else if (query.status) {
    where.status = query.status;
  }

  if (query.condition) where.condition = query.condition;
  if (query.saleMode) where.saleMode = query.saleMode;
  if (query.saleFormat) where.saleFormat = query.saleFormat;
  if (query.availability) where.availability = query.availability;
  if (query.state) where.location = { [Op.iLike]: `%${query.state}%` };
  if (query.commercialModel) where.commercialModel = query.commercialModel;
  if (query.location) where.location = { [Op.iLike]: `%${query.location}%` };
  if (query.brand) where.brand = { [Op.iLike]: `%${query.brand}%` };
  if (query.featured !== undefined) where.featured = query.featured;
  if (query.supplierId) where.supplierId = query.supplierId;

  if (query.search) {
    const termo = `%${query.search}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: termo } },
      { shortDescription: { [Op.iLike]: termo } },
      { brand: { [Op.iLike]: termo } },
      { location: { [Op.iLike]: termo } },
    ];
  }

  if (query.minPrice || query.maxPrice) {
    where.price = {};
    if (query.minPrice) where.price[Op.gte] = query.minPrice;
    if (query.maxPrice) where.price[Op.lte] = query.maxPrice;
  }

  // Campos tecnicos: filtro exato dentro do JSONB. Exibidos e filtrados
  // apenas quando preenchidos — a tela nao mostra "Voltagem: —".
  for (const campo of CAMPOS_TECNICOS) {
    if (query[campo]) {
      where.attributes = { ...(where.attributes || {}), [campo]: query[campo] };
    }
  }

  return where;
}

async function resolverCategoria(query) {
  const include = [];
  if (query.category) {
    const cat = await db.Category.findOne({ where: { slug: query.category } });
    if (!cat) throw AppError.notFound("Categoria nao encontrada.", "CATEGORY_NOT_FOUND");
    include.push(cat.id);
  }
  return include;
}

/**
 * Escolhe a apresentação conforme o consumidor.
 *
 * A vitrine recebe a forma do catálogo — a que o front já sabe ler. A gestão
 * recebe a forma crua, com os campos operacionais. É o mesmo registro visto de
 * dois lugares, e por isso a decisão vive num único ponto.
 */
const apresentar = (asset, publico) => (publico ? paraCatalogo(asset) : comDesconto(asset));

/**
 * Valores que o painel de filtros deve oferecer.
 *
 * O cliente foi direto: "a marca do ativo sai do filtro quando o estoque do
 * item for vendido, sinalizar zerado no estoque". Sao duas coisas distintas e
 * ambas foram feitas — o ativo CONTINUA na vitrine, sinalizado como sem
 * estoque (`inStock: false` e a linha "Estoque: Esgotado" na ficha), mas os
 * valores dele NAO entram nas opcoes de filtro.
 *
 * A alternativa seria sumir com o ativo da lista. Foi recusada: o ativo
 * esgotado ainda e prova de acervo, ainda recebe consulta e pode voltar ao
 * estoque (um pedido cancelado devolve a quantidade), e a URL dele indexada
 * passaria a dar 404 a cada esgotamento. O que engana o comprador nao e ver o
 * ativo esgotado — e clicar num filtro "Tigre" que devolve zero resultado
 * comprave.
 *
 * As contagens saem da MESMA consulta filtrada da listagem, so sem paginacao:
 * assim o numero ao lado da opcao corresponde ao que o clique vai devolver, e
 * nao ao acervo inteiro.
 */
const DIMENSOES_DE_FILTRO = [
  ["brand", (a) => a.brand],
  ["location", (a) => a.location],
  ["condition", (a) => ROTULO_CONDICAO[a.condition] || a.condition],
  ["saleFormat", (a) => ROTULO_FORMA_VENDA[a.saleFormat] || a.saleFormat],
  ["availability", (a) => ROTULO_DISPONIBILIDADE[a.availability] || a.availability],
  ["category", (a) => a["categoria.name"]],
];

async function filtrosDisponiveis(whereListagem) {
  const linhas = await db.Asset.findAll({
    // `quantity > 0` e a regra inteira do item: sem saldo, o valor do ativo
    // deixa de ser uma opcao de filtro no mesmo instante.
    where: { ...whereListagem, quantity: { [Op.gt]: 0 } },
    attributes: ["brand", "location", "condition", "saleFormat", "availability"],
    include: [{ model: db.Category, as: "categoria", attributes: ["name"] }],
    raw: true,
  });

  const saida = {};
  for (const [nome, extrair] of DIMENSOES_DE_FILTRO) {
    const contagem = new Map();
    for (const linha of linhas) {
      const valor = extrair(linha);
      if (valor === null || valor === undefined || String(valor).trim() === "") continue;
      contagem.set(String(valor), (contagem.get(String(valor)) || 0) + 1);
    }
    saida[nome] = [...contagem.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
      .map(([value, count]) => ({ value, label: value, count }));
  }
  return saida;
}

async function listar(query, { somentePublicados = true } = {}) {
  const { page, perPage, limit, offset } = parsePagination(query);
  const where = montarFiltros(query, { somentePublicados });

  if (query.category) {
    const [categoryId] = await resolverCategoria(query);
    where.categoryId = categoryId;
  }
  if (query.subcategory) {
    const sub = await db.Subcategory.findOne({ where: { slug: query.subcategory } });
    if (!sub) throw AppError.notFound("Subcategoria nao encontrada.", "SUBCATEGORY_NOT_FOUND");
    where.subcategoryId = sub.id;
  }

  const ordem = {
    recentes: [["publishedAt", "DESC NULLS LAST"], ["createdAt", "DESC"]],
    preco_asc: [["price", "ASC NULLS LAST"]],
    preco_desc: [["price", "DESC NULLS LAST"]],
    nome: [["name", "ASC"]],
  }[query.sort || "recentes"];

  const resultado = await db.Asset.findAndCountAll({
    where,
    include: INCLUDES(),
    order: ordem,
    limit,
    offset,
    distinct: true,
  });

  return {
    rows: resultado.rows.map((a) => apresentar(a, somentePublicados)),
    count: resultado.count,
    page,
    perPage,
    // So o catalogo publico monta painel de filtros. Na area interna a gestao
    // precisa de alcancar tambem o que esta esgotado, e uma lista de opcoes
    // que esconde o esgotado atrapalharia exatamente esse trabalho.
    filtros: somentePublicados ? await filtrosDisponiveis(where) : undefined,
  };
}

/**
 * Intercala as categorias em vez de devolver os primeiros N do catalogo.
 * O acervo e desbalanceado, entao ordenar por data enche a vitrine de uma
 * categoria so — e a RED nao e so construcao.
 */
async function destaques({ limit = 9 } = {}) {
  const categorias = await db.Category.findAll({
    where: { active: true },
    order: [["position", "ASC"]],
  });

  const porCategoria = await Promise.all(
    categorias.map((cat) =>
      db.Asset.findAll({
        where: { status: ASSET_STATUS.PUBLICADO, categoryId: cat.id },
        include: INCLUDES(),
        order: [["featured", "DESC"], ["publishedAt", "DESC NULLS LAST"]],
        limit,
      })
    )
  );

  const saida = [];
  for (let i = 0; saida.length < limit; i += 1) {
    let inseriu = false;
    for (const lista of porCategoria) {
      if (lista[i]) {
        saida.push(paraCatalogo(lista[i]));
        inseriu = true;
        if (saida.length === limit) break;
      }
    }
    if (!inseriu) break;
  }

  return saida;
}

async function porSlug(slug, { somentePublicados = true } = {}) {
  const where = { slug };
  if (somentePublicados) where.status = ASSET_STATUS.PUBLICADO;

  const asset = await db.Asset.findOne({ where, include: INCLUDES() });
  if (!asset) throw AppError.notFound("Ativo nao encontrado.", "ASSET_NOT_FOUND");
  return apresentar(asset, somentePublicados);
}

async function criar(dados, { atorId }) {
  const categoria = await db.Category.findByPk(dados.categoryId);
  if (!categoria) throw AppError.badRequest("Categoria invalida.", "CATEGORY_INVALID");

  if (dados.subcategoryId) {
    const sub = await db.Subcategory.findByPk(dados.subcategoryId);
    if (!sub || sub.categoryId !== dados.categoryId) {
      throw AppError.badRequest(
        "Subcategoria nao pertence a categoria informada.",
        "SUBCATEGORY_MISMATCH"
      );
    }
  }

  const slug = await slugUnico(db.Asset, dados.slug || dados.name);

  // Nasce sempre em rascunho: ninguem cria ativo ja publicado, nem admin.
  const asset = await db.Asset.create({
    ...dados,
    // Sem `originalQuantity` o model punha 1, e um lote cadastrado com 500
    // unidades passava a ter "quantidade vendida" (original - disponivel)
    // negativa no painel e nada para devolver ao estoque numa volta de
    // vendido. Quem nao informa o original esta a cadastrar o lote inteiro.
    originalQuantity: dados.originalQuantity ?? dados.quantity ?? undefined,
    slug,
    status: ASSET_STATUS.RASCUNHO,
    supplierId: dados.supplierId || atorId,
  });

  await audit.registrar({
    entity: "asset",
    entityId: asset.id,
    action: "cadastro",
    depois: { status: asset.status, price: asset.price, name: asset.name },
    ator: { id: atorId },
  });

  if (Array.isArray(dados.images) && dados.images.length) {
    await db.AssetImage.bulkCreate(
      dados.images.map((img, i) => ({
        assetId: asset.id,
        url: img.url,
        alt: img.alt,
        position: img.position ?? i,
      }))
    );
  }

  return porId(asset.id);
}

async function porId(id) {
  const asset = await db.Asset.findByPk(id, { include: INCLUDES() });
  if (!asset) throw AppError.notFound("Ativo nao encontrado.", "ASSET_NOT_FOUND");
  return comDesconto(asset);
}

async function atualizar(id, dados, opcoes = {}) {
  const asset = await db.Asset.findByPk(id);
  if (!asset) throw AppError.notFound("Ativo nao encontrado.", "ASSET_NOT_FOUND");

  // Alterar preco ou modelo depois de aprovado invalida a aprovacao: o
  // fornecedor aprovou aqueles numeros, nao outros.
  const mudouComercial =
    (dados.price !== undefined && String(dados.price) !== String(asset.price)) ||
    (dados.commercialModel !== undefined && dados.commercialModel !== asset.commercialModel);

  if (mudouComercial && asset.supplierApprovedAt) {
    dados.supplierApprovedAt = null;
    if (asset.status === ASSET_STATUS.PUBLICADO || asset.status === ASSET_STATUS.APROVADO) {
      dados.status = ASSET_STATUS.AGUARDANDO_APROVACAO;
    }
  }

  if (dados.name && !dados.slug) {
    dados.slug = await slugUnico(db.Asset, dados.name, { ignoreId: asset.id });
  }

  // Snapshot dos campos que a regra manda rastrear (secao 23).
  const rastreados = ["price", "marketPrice", "quantity", "commercialModel", "saleMode", "status"];
  const antes = Object.fromEntries(rastreados.map((c) => [c, asset[c]]));

  await asset.update(dados);

  await audit.registrar({
    entity: "asset",
    entityId: asset.id,
    action: "update",
    antes,
    depois: Object.fromEntries(rastreados.map((c) => [c, asset[c]])),
    ator: opcoes.ator,
    notes: mudouComercial ? "Alteracao comercial invalidou a aprovacao do fornecedor." : undefined,
  });

  return porId(asset.id);
}

/**
 * Quantidade efetivamente vendida de um ativo.
 *
 * Soma os itens de pedidos que NAO foram cancelados. Pedido cancelado nao
 * consumiu nada: a confirmacao baixou o estoque, o cancelamento desfez a
 * venda, e contar essa quantidade como vendida manteria o ativo fora do
 * catalogo por uma venda que deixou de existir.
 */
async function quantidadeVendida(assetId) {
  const linha = await db.OrderItem.findOne({
    where: { assetId },
    attributes: [[fn("COALESCE", fn("SUM", col("OrderItem.quantity")), 0), "total"]],
    include: [
      {
        model: db.Order,
        as: "pedido",
        attributes: [],
        required: true,
        where: { status: { [Op.ne]: ORDER_STATUS.CANCELADO } },
      },
    ],
    raw: true,
  });
  return Number(linha?.total || 0);
}

/**
 * Devolve ao estoque um ativo que voltou de VENDIDO para PUBLICADO.
 *
 * O cliente pediu a volta porque venda cancelada e marcacao por engano
 * acontecem. Mas republicar com quantidade zero produziria um ativo visivel,
 * clicavel e impossivel de comprar — pior do que o ativo preso.
 *
 * A reposicao NAO e arbitraria nem e a quantidade original: e
 * `quantidade original - quantidade realmente vendida em pedidos vivos`.
 * Assim os tres casos caem no lugar certo sem o operador ter de escolher:
 *
 *  - marcado vendido por engano, sem pedido nenhum -> volta tudo;
 *  - venda cancelada -> volta o que o cancelamento libertou;
 *  - venda real e viva -> da zero, e ai a transicao e RECUSADA, porque
 *    republicar seria oferecer o que ja foi entregue. O operador corrige a
 *    quantidade primeiro (recebeu mais pecas, por exemplo) e republica.
 *
 * Inventar quantidade aqui seria pior do que recusar: o comprador consegue
 * fechar o pedido e a RED descobre no galpao que nao ha o que entregar.
 */
async function quantidadeParaDevolverAoEstoque(asset) {
  if (Number(asset.quantity) > 0) return null;

  const original = Number(asset.originalQuantity || 0);
  const reposta = Math.max(0, original - (await quantidadeVendida(asset.id)));

  if (reposta <= 0) {
    throw AppError.unprocessable(
      "Ativo sem quantidade a devolver ao estoque. Ajuste a quantidade antes de republicar.",
      "NO_QUANTITY_TO_RESTORE",
      { quantidadeOriginal: original, quantidadeDisponivel: Number(asset.quantity) }
    );
  }

  return reposta;
}

/** Toda troca de status passa por aqui — nao existe update("status") solto. */
async function mudarStatus(id, novoStatus, { motivo, ator } = {}) {
  const asset = await db.Asset.findByPk(id);
  if (!asset) throw AppError.notFound("Ativo nao encontrado.", "ASSET_NOT_FOUND");

  const permitidos = ASSET_TRANSICOES[asset.status] || [];
  if (!permitidos.includes(novoStatus)) {
    throw AppError.unprocessable(
      `Transicao invalida: ${asset.status} -> ${novoStatus}.`,
      "INVALID_TRANSITION",
      { de: asset.status, para: novoStatus, permitidos }
    );
  }

  const patch = { status: novoStatus };

  if (novoStatus === ASSET_STATUS.PUBLICADO) {
    // A regra central da RED: nada e comercializado por preco nao autorizado.
    //
    // Duas situacoes dispensam a aprovacao porque nao ha terceiro a proteger:
    // o ativo nao ter fornecedor (e da propria RED), e quem publica ser o
    // proprio fornecedor — nesse caso o consentimento sobre o preco e o
    // proprio ato de publicar. Em ambas a autorizacao fica registada em nome
    // de quem publicou, para que ativo publicado continue a ter sempre preco
    // autorizado e um autorizador com nome.
    const proprioDono = !asset.supplierId || asset.supplierId === ator?.id;

    if (!asset.supplierApprovedAt) {
      if (!proprioDono) {
        throw AppError.unprocessable(
          "Publicacao exige aprovacao do fornecedor sobre preco e modelo.",
          "SUPPLIER_APPROVAL_REQUIRED"
        );
      }
      patch.supplierApprovedAt = new Date();
      patch.supplierApprovedBy = ator?.id || null;
    }
    if (asset.saleMode === MODALIDADES.DIRETA && (asset.price === null || Number(asset.price) <= 0)) {
      throw AppError.unprocessable(
        "Ativo de compra direta exige preco definido.",
        "PRICE_REQUIRED"
      );
    }
    patch.publishedAt = new Date();
  }

  // Volta ao estoque: o carimbo de venda sai (o ativo nao esta vendido) e a
  // quantidade e reposta pelo que sobrou de facto. Ambos antes do update para
  // que a recusa por falta de quantidade aconteca sem gravar nada.
  if (novoStatus === ASSET_STATUS.PUBLICADO && asset.status === ASSET_STATUS.VENDIDO) {
    patch.soldAt = null;
    const reposta = await quantidadeParaDevolverAoEstoque(asset);
    if (reposta !== null) patch.quantity = reposta;
  }

  if (novoStatus === ASSET_STATUS.VENDIDO) patch.soldAt = new Date();
  if (motivo) patch.attributes = { ...asset.attributes, ultimoMotivo: motivo };

  const statusAnterior = asset.status;
  await asset.update(patch);

  await audit.registrar({
    entity: "asset",
    entityId: asset.id,
    action: "mudanca_status",
    antes: { status: statusAnterior },
    depois: { status: novoStatus },
    ator,
    notes: motivo,
  });

  if (novoStatus === ASSET_STATUS.PUBLICADO) {
    eventos.registrar(eventos.EVENTOS.ASSET_PUBLISHED, {
      assetId: asset.id,
      userId: asset.supplierId,
      payload: { categoryId: asset.categoryId, price: asset.price },
    });
    notificacoes.notificar(
      asset.supplierId,
      notificacoes.TIPOS.ATIVO_PUBLICADO,
      { assetName: asset.name, entity: "asset", entityId: asset.id },
      { email: true }
    );
  }

  if (novoStatus === ASSET_STATUS.VENDIDO) {
    eventos.registrar(eventos.EVENTOS.ASSET_SOLD, {
      assetId: asset.id,
      userId: asset.supplierId,
    });
    notificacoes.notificar(asset.supplierId, notificacoes.TIPOS.ATIVO_VENDIDO, {
      assetName: asset.name,
      entity: "asset",
      entityId: asset.id,
    });
  }

  return porId(asset.id);
}

/** Carimbo do fornecedor sobre preco e modelo. Sem ele nao ha publicacao. */
async function aprovarPeloFornecedor(id, { atorId, role }) {
  const asset = await db.Asset.findByPk(id);
  if (!asset) throw AppError.notFound("Ativo nao encontrado.", "ASSET_NOT_FOUND");

  const ehDono = asset.supplierId && asset.supplierId === atorId;
  const ehAdmin = role === "admin" || role === "curador";
  if (!ehDono && !ehAdmin) {
    throw AppError.forbidden("Apenas o fornecedor do ativo pode aprovar.");
  }

  if (asset.status !== ASSET_STATUS.AGUARDANDO_APROVACAO) {
    throw AppError.unprocessable(
      "Ativo nao esta aguardando aprovacao.",
      "NOT_AWAITING_APPROVAL",
      { status: asset.status }
    );
  }

  await asset.update({
    supplierApprovedAt: new Date(),
    supplierApprovedBy: atorId,
    status: ASSET_STATUS.APROVADO,
  });

  // A regra pede preco aprovado, data da aprovacao E usuario responsavel.
  await audit.registrar({
    entity: "asset",
    entityId: asset.id,
    action: "aprovacao_fornecedor",
    antes: { status: ASSET_STATUS.AGUARDANDO_APROVACAO },
    depois: {
      status: ASSET_STATUS.APROVADO,
      price: asset.price,
      commercialModel: asset.commercialModel,
    },
    ator: { id: atorId, role },
  });

  return porId(asset.id);
}

async function remover(id) {
  const asset = await db.Asset.findByPk(id);
  if (!asset) throw AppError.notFound("Ativo nao encontrado.", "ASSET_NOT_FOUND");
  await asset.destroy();
  return { ok: true };
}

module.exports = {
  listar,
  destaques,
  porSlug,
  porId,
  criar,
  atualizar,
  mudarStatus,
  aprovarPeloFornecedor,
  remover,
};
