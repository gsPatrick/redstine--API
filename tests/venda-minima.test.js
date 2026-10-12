"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);

const { criarSchema, atualizarSchema } = require("../src/features/assets/assets.schemas");
const { paraCatalogo, ficha } = require("../src/features/assets/assets.catalogo");
const { ASSET_STATUS, MODALIDADES } = require("../src/config/constants");

/** Ativo mínimo para o mapa do catálogo, no formato que a linha do banco tem. */
const ativo = (extra = {}) => ({
  id: "11111111-1111-1111-1111-111111111111",
  sku: "RED-001",
  slug: "cadeira",
  name: "CADEIRA GIRATORIA",
  quantity: 15,
  unit: "unidade",
  status: ASSET_STATUS.PUBLICADO,
  availability: "disponivel",
  saleMode: MODALIDADES.DIRETA,
  price: 100,
  marketPrice: 200,
  imagens: [],
  attributes: {},
  ...extra,
});

describe("venda minima", () => {
  test("o schema aceita a minima e recusa zero: zero nao e 'sem minima', e pedido vazio", () => {
    assert.equal(criarSchema.shape.minOrderQuantity.parse(5), 5);
    assert.ok(!criarSchema.partial().safeParse({ minOrderQuantity: 0 }).success);
    assert.ok(!atualizarSchema.safeParse({ minOrderQuantity: -2 }).success);
  });

  test("texto numerico do formulario e coagido: o painel manda string", () => {
    assert.equal(criarSchema.shape.minOrderQuantity.parse("5"), 5);
  });

  test("o catalogo sempre devolve numero >= 1, mesmo em linha antiga sem a coluna", () => {
    assert.equal(paraCatalogo(ativo()).minOrderQuantity, 1);
    assert.equal(paraCatalogo(ativo({ minOrderQuantity: null })).minOrderQuantity, 1);
    assert.equal(paraCatalogo(ativo({ minOrderQuantity: 5 })).minOrderQuantity, 5);
  });

  test("a ficha so mostra a minima quando ela existe de verdade", () => {
    const comUm = ficha(ativo({ minOrderQuantity: 1 })).map((l) => l.name);
    assert.ok(!comUm.includes("Venda mínima"));

    const comCinco = ficha(ativo({ minOrderQuantity: 5 }));
    const linha = comCinco.find((l) => l.name === "Venda mínima");
    assert.deepEqual(linha.values, ["5 unidade"]);
  });
});

describe("indicador de oportunidade do sob consulta", () => {
  test("acompanha o ativo sob consulta, onde ele ocupa o lugar do preco", () => {
    const p = paraCatalogo(
      ativo({ saleMode: MODALIDADES.CONSULTA, consultationNote: "Até 30% abaixo do mercado" })
    );
    assert.equal(p.underConsultation, true);
    assert.equal(p.consultationNote, "Até 30% abaixo do mercado");
  });

  test("NAO acompanha a compra direta: ali o preco esta a vista e a frase seria uma segunda afirmacao sobre o mesmo valor", () => {
    const p = paraCatalogo(ativo({ consultationNote: "Até 30% abaixo do mercado" }));
    assert.equal(p.underConsultation, false);
    assert.equal(p.consultationNote, null);
  });

  test("vazio e ausencia de indicador, nao string vazia", () => {
    const p = paraCatalogo(ativo({ saleMode: MODALIDADES.CONSULTA, consultationNote: "" }));
    assert.equal(p.consultationNote, null);
  });

  test("o schema aceita null — e assim que a gestao APAGA o indicador", () => {
    assert.ok(atualizarSchema.safeParse({ consultationNote: null }).success);
    assert.ok(!atualizarSchema.safeParse({ consultationNote: "x".repeat(161) }).success);
  });
});
