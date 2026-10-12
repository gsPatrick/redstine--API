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
  // "Tipo" sai da subcategoria — e o descritivo pede o campo na ficha
  // ("Tipo — exemplo: Estante industrial"). Nao existe coluna propria para
  // ele, e criar uma duplicaria o que a subcategoria ja diz.
  add("Tipo", asset.subcategoria?.name);
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
  // Mínima em 1 não é informação: é o default de todo o acervo e a linha só
  // ocuparia espaço na ficha.
  add(
    "Venda mínima",
    Number(asset.minOrderQuantity) > 1
      ? `${asset.minOrderQuantity} ${asset.unit || "unidade"}`
      : null
  );
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

    /**
     * Venda mínima. Sempre um número >= 1, mesmo em linha antiga sem a
     * coluna: o seletor do front não tem como lidar com `null` e cair para 1
     * é exatamente o comportamento de quem não tem mínima.
     */
    minOrderQuantity: Math.max(1, Number(json.minOrderQuantity || 1)),

    /**
     * Indicador de oportunidade. Só acompanha o ativo sob consulta, que é
     * onde ele ocupa o lugar do preço. Num ativo de compra direta o preço
     * está ali e a frase seria uma segunda afirmação sobre o mesmo valor.
     */
    consultationNote:
      json.saleMode === MODALIDADES.CONSULTA ? json.consultationNote || null : null,
    inStock: disponivel(json),

    /**
     * Visualizacoes (revisao do cliente, item 33).
     *
     * Vem do contador do proprio ativo, que ja veio na linha — nao de uma
     * agregacao sobre `events`. E o que permite o card exibir o numero na
     * listagem: contar por ativo aqui seria uma consulta por card.
     *
     * O nome `views` e o que o front le no card e na pagina do produto.
     */
    views: Number(json.viewsCount || 0),

    /**
     * Aplicações — a aba do mesmo nome, no descritivo novo.
     *
     * Vive em `attributes.aplicacoes` e NÃO entra na ficha técnica: a ficha é
     * campo-e-valor, e aplicações é prosa ("hotéis, restaurantes, escritórios").
     * Posta na ficha, apareceria também no card "Características", que o
     * documento manda conter só informação própria do produto.
     *
     * Vem como lista: a gestão escreve uma por linha, ou separadas por ponto e
     * vírgula, que é como o acervo já traz este texto.
     */
    applications: String(json.attributes?.aplicacoes || "")
      .split(/[;\n]/)
      .map((t) => t.trim())
      .filter(Boolean),

    attributes: ficha(json),
  };
}

module.exports = { paraCatalogo, ficha, disponivel };
