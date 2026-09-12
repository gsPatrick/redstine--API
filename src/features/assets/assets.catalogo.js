"use strict";

const {
  ROTULO_CONDICAO,
  ROTULO_FORMA_VENDA,
  ROTULO_DISPONIBILIDADE,
  CAMPOS_TECNICOS,
  ASSET_STATUS,
  DISPONIBILIDADE,
  MODALIDADES,
  ROTULO_MODELO_COMERCIAL,
} = require("../../config/constants");

/**
 * Apresentação do ativo para o CATÁLOGO PÚBLICO.
 *
 * A forma aqui é ditada pelo front: o site já consome `images[].src`,
 * `categories[]`, `attributes[{name, values}]`, `condition` como rótulo legível
 * e `inStock` booleano. Em vez de reescrever o front para o formato do banco,
 * é a API que entrega pronto — o front é a especificação.
 *
 * Isto NÃO substitui a forma administrativa (`/assets/admin`, `/management/*`),
 * que continua expondo os campos crus de que a gestão precisa. São duas
 * leituras do mesmo registro, para dois consumidores diferentes.
 */

const cent = (n) => (n === null || n === undefined ? 0 : Number(Number(n).toFixed(2)));

const ROTULO_TECNICO = {
  modelo: "Modelo",
  dimensoes: "Dimensões",
  peso: "Peso",
  potencia: "Potência",
  voltagem: "Voltagem",
  capacidade: "Capacidade",
  acabamento: "Acabamento",
};

/**
 * Ficha técnica.
 *
 * Só entra o que está preenchido — a ficha não exibe "Voltagem: —". A ordem é
 * fixa e começa pelo que decide a compra (condição, localização, quantidade),
 * não pela ordem em que os campos foram cadastrados.
 */
function ficha(asset) {
  const linhas = [];
  const add = (name, valor) => {
    if (valor !== null && valor !== undefined && String(valor).trim() !== "") {
      linhas.push({ name, values: [String(valor)] });
    }
  };

  add("Condição", ROTULO_CONDICAO[asset.condition]);
  add("Localização", asset.location);
  add("Forma de venda", ROTULO_FORMA_VENDA[asset.saleFormat]);
  add("Disponibilidade", ROTULO_DISPONIBILIDADE[asset.availability]);
  // Estoque zerado e sinalizado, nao omitido: a ficha sem a linha de
  // quantidade deixava o comprador a supor que havia saldo e a descobrir o
  // contrario so no botao ausente.
  add(
    "Quantidade disponível",
    asset.quantity > 0 ? `${asset.quantity} ${asset.unit || "unidade"}` : null
  );
  add("Estoque", Number(asset.quantity) > 0 ? null : "Esgotado");
  add("Marca", asset.brand);
  add("Material", asset.material);
  add("Cor", asset.color);
  add("Tamanho", asset.size);

  for (const campo of CAMPOS_TECNICOS) {
    add(ROTULO_TECNICO[campo] || campo, asset.attributes?.[campo]);
  }

  return linhas;
}

/**
 * Disponível para compra.
 *
 * Três condições, e todas precisam valer: publicado, com saldo e não reservado.
 * Um ativo reservado ainda aparece no catálogo — some-lo esconderia da vitrine
 * um item que pode voltar —, mas não oferece botão de compra.
 */
function disponivel(asset) {
  return (
    asset.status === ASSET_STATUS.PUBLICADO &&
    Number(asset.quantity) > 0 &&
    asset.availability !== DISPONIBILIDADE.RESERVADO
  );
}

function paraCatalogo(asset) {
  const json = typeof asset.toJSON === "function" ? asset.toJSON() : asset;

  const preco = cent(json.price);
  const mercado = cent(json.marketPrice);
  const emPromocao = mercado > 0 && preco > 0 && preco < mercado;

  const categorias = [];
  if (json.categoria) categorias.push({ name: json.categoria.name, slug: json.categoria.slug });
  if (json.subcategoria) {
    categorias.push({ name: json.subcategoria.name, slug: json.subcategoria.slug });
  }

  return {
    id: json.id,
    sku: json.sku,
    slug: json.slug,
    name: json.name,

    price: preco,
    // O front chama de `regularPrice` o preço de referência riscado — é o
    // preço de mercado, que sustenta a promessa de "até 50% do valor".
    regularPrice: mercado,
    onSale: emPromocao,
    discountPercent: typeof asset.descontoPercentual === "function" ? asset.descontoPercentual() : null,

    shortDescription: json.shortDescription || "",
    description: json.description || "",

    // `src` e não `url`: é o nome que o componente de galeria já lê.
    images: (json.imagens || []).map((img) => ({
      src: img.url,
      alt: img.alt || json.name,
      width: 1254,
      height: 1254,
    })),

    categories: categorias,

    // Rótulos legíveis, não as chaves do banco: a vitrine mostra
    // "Usado em bom estado", nunca "usado_bom".
    condition: ROTULO_CONDICAO[json.condition] || null,
    conditionKey: json.condition,
    location: json.location,
    brand: json.brand,
    material: json.material,
    color: json.color,
    size: json.size,

    saleFormatLabel: ROTULO_FORMA_VENDA[json.saleFormat] || null,
    availabilityLabel: ROTULO_DISPONIBILIDADE[json.availability] || null,
    commercialModel: ROTULO_MODELO_COMERCIAL[json.commercialModel] || null,

    // Sob consulta não tem preço fechado: o front troca o CTA por
    // "Consultar Condições" a partir daqui.
    saleMode: json.saleMode,
    underConsultation: json.saleMode === MODALIDADES.CONSULTA,

    quantity: json.quantity,
    unit: json.unit,
    inStock: disponivel(json),

    attributes: ficha(json),
  };
}

module.exports = { paraCatalogo, ficha, disponivel };
