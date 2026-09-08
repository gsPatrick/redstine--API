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
      location: p.location || null,
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
