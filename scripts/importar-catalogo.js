"use strict";

/**
 * Importa o catálogo do site para a API.
 *
 * Os 42 ativos vieram do site anterior e viviam num JSON estático dentro do
 * front. Trazê-los para o banco é o que permite ao site público ler da API
 * como qualquer outra tela — sem isso a vitrine ficaria vazia depois da
 * integração.
 *
 * Idempotente pelo slug: rodar de novo atualiza, não duplica.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);

const path = require("path");
const fs = require("fs");
const db = require("../src/models");
const { slugUnico } = require("../src/utils/slug");
const {
  ASSET_STATUS,
  MODALIDADES,
  MODELOS_COMERCIAIS,
  FORMAS_DE_VENDA,
  DISPONIBILIDADE,
} = require("../src/config/constants");

/**
 * O catálogo vive DENTRO do repositório.
 *
 * Antes apontava para o JSON no projeto do front, um caminho fora daqui — no
 * contêiner esse arquivo não existe e a importação falharia. Uma cópia própria
 * torna a API autossuficiente, que é o que um deploy precisa.
 */
const ORIGEM = path.resolve(__dirname, "dados/catalogo-inicial.json");

/** O JSON traz a condição por extenso; o banco guarda a chave. */
const CONDICAO = {
  "sem uso": "sem_uso",
  novo: "sem_uso",
  seminovo: "seminovo",
  "usado em bom estado": "usado_bom",
  usado: "usado_bom",
  "usado com sinais de uso": "usado_sinais",
  "necessita reparo": "necessita_reparo",
};

const chaveCondicao = (texto) => CONDICAO[String(texto || "").trim().toLowerCase()] || "usado_bom";

const semAcento = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/**
 * Texto livre do acervo antigo -> uma localizacao da lista fechada, ou nada.
 *
 * O mesmo mapa da migracao, pelo mesmo motivo: "Pilares" e bairro do municipio
 * do Rio de Janeiro, logo o ativo esta no Rio. O que nao casa com nenhuma
 * localizacao cadastrada nao vira cidade nova — volta como ausencia, que e
 * verificavel.
 */
function casarLocalizacao(texto, localizacoes) {
  const t = semAcento(texto);
  if (!t) return { locationId: null, location: null };
  const achou = localizacoes.find(
    (l) => t.startsWith(semAcento(l.city)) || t.startsWith(semAcento(l.slug.replace(/-/g, " ")))
  );
  const alias = { pilares: "rio-de-janeiro-rj", rio: "rio-de-janeiro-rj" };
  const porAlias = achou || localizacoes.find((l) => l.slug === alias[t.split(/[^a-z]/)[0]]);
  return porAlias ? { locationId: porAlias.id, location: porAlias.name } : { locationId: null, location: null };
}

/** Lê um atributo da ficha do JSON de origem pelo nome. */
function atributo(produto, nome) {
  const a = (produto.attributes || []).find(
    (x) => x.name?.toLowerCase() === nome.toLowerCase()
  );
  return a?.values?.[0] || null;
}

async function main() {
  if (!fs.existsSync(ORIGEM)) throw new Error(`Catálogo de origem não encontrado: ${ORIGEM}`);

  const bruto = JSON.parse(fs.readFileSync(ORIGEM, "utf8"));
  const produtos = Array.isArray(bruto) ? bruto : bruto.products || [];
  if (!produtos.length) throw new Error("O catálogo de origem está vazio.");

  const categorias = await db.Category.findAll({
    include: [{ model: db.Subcategory, as: "subcategorias" }],
  });
  if (!categorias.length) throw new Error("Rode `npm run seed` antes: faltam categorias.");

  const porSlug = new Map(categorias.map((c) => [c.slug, c]));

  const localizacoes = await db.Location.findAll({ where: { active: true } });

  let criados = 0;
  let atualizados = 0;
  let semCategoria = 0;

  for (const p of produtos) {
    const slugCategoria = p.categories?.[0]?.slug;
    const categoria = porSlug.get(slugCategoria);

    // Sem categoria conhecida o ativo não entra: um item fora das três frentes
    // apareceria no catálogo sem lugar em filtro nenhum.
    if (!categoria) {
      semCategoria += 1;
      continue;
    }

    const preco = Number(p.price) || 0;
    const mercado = Number(p.regularPrice) || 0;

    const dados = {
      categoryId: categoria.id,
      name: p.name,
      shortDescription: p.shortDescription || null,
      description: p.description || null,
      condition: chaveCondicao(p.condition || atributo(p, "Condição")),
      // Localizacao e lista fechada: o JSON do acervo antigo traz texto livre
      // ("Pilares/RJ"), e importa-lo de volta reintroduziria exatamente a
      // sujeira que a migracao limpou. Casa-se com a lista quando da; quando
      // nao da, entra sem localizacao e aparece na pendencia operacional, para
      // alguem decidir — o importador nao inventa cidade.
      ...casarLocalizacao(p.location, localizacoes),
      brand: p.brand || null,
      material: p.material || null,
      color: p.color || null,
      size: p.size || null,
      // O acervo importado não traz quantidade; entra com 1 para não sugerir
      // um estoque que ninguém contou.
      originalQuantity: 1,
      quantity: p.inStock === false ? 0 : 1,
      unit: "unidade",
      price: preco || null,
      // Sem preço de referência não há desconto verificável — melhor nulo do
      // que um número inventado.
      marketPrice: mercado > preco ? mercado : null,
      // Sem preço definido o ativo entra sob consulta, que é a modalidade
      // honesta para quem ainda não tem valor fechado.
      saleMode: preco > 0 ? MODALIDADES.DIRETA : MODALIDADES.CONSULTA,
      saleFormat: FORMAS_DE_VENDA.UNIDADE,
      availability: DISPONIBILIDADE.DISPONIVEL,
      commercialModel: MODELOS_COMERCIAIS.CATALOGO,
      status: ASSET_STATUS.PUBLICADO,
      publishedAt: new Date(),
      supplierApprovedAt: new Date(),
      attributes: {},
    };

    let asset = await db.Asset.findOne({ where: { slug: p.slug } });

    if (asset) {
      await asset.update(dados);
      atualizados += 1;
    } else {
      asset = await db.Asset.create({
        ...dados,
        slug: await slugUnico(db.Asset, p.slug),
        sku: p.sku || `RED-${String(p.id).padStart(5, "0")}`,
      });
      criados += 1;
    }

    // Imagens: substituídas por completo a cada importação, para o catálogo
    // refletir a origem em vez de acumular versões antigas.
    await db.AssetImage.destroy({ where: { assetId: asset.id } });
    const imagens = (p.images || []).map((img, i) => ({
      assetId: asset.id,
      url: img.src,
      alt: img.alt || p.name,
      position: i,
    }));
    if (imagens.length) await db.AssetImage.bulkCreate(imagens);
  }

  console.log("catálogo importado:", {
    origem: produtos.length,
    criados,
    atualizados,
    ignoradosSemCategoria: semCategoria,
    publicadosNoBanco: await db.Asset.count({ where: { status: ASSET_STATUS.PUBLICADO } }),
  });

  await db.sequelize.close();
}

main().catch((e) => {
  console.error("importação falhou:", e.message);
  process.exit(1);
});
