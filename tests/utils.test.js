"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);
const { slugify } = require("../src/utils/slug");
const { gerarReferencia } = require("../src/utils/reference");
const { parsePagination, MAX_PER_PAGE } = require("../src/utils/pagination");

describe("slugify", () => {
  test("remove acento e normaliza", () => {
    assert.equal(slugify("Louças, Metais e Sanitários"), "loucas-metais-e-sanitarios");
  });

  test("nao deixa hifen nas pontas", () => {
    assert.equal(slugify("  --RED Construção--  "), "red-construcao");
  });

  test("trunca em 180 caracteres", () => {
    assert.ok(slugify("a".repeat(300)).length <= 180);
  });
});

describe("referencia", () => {
  test("usa o prefixo e tem o tamanho pedido", () => {
    const r = gerarReferencia("RED", 6);
    assert.match(r, /^RED-[2-9A-HJ-NP-Z]{6}$/);
  });

  test("nao usa caracteres ambiguos (0, O, 1, I)", () => {
    for (let i = 0; i < 200; i += 1) {
      assert.ok(!/[01OI]/.test(gerarReferencia("RED").split("-")[1]));
    }
  });
});

describe("paginacao", () => {
  test("valores omitidos caem no padrao", () => {
    const { page, perPage } = parsePagination({});
    assert.equal(page, 1);
    assert.equal(perPage, 20);
  });

  test("perPage tem teto — nao existe consulta sem limite", () => {
    assert.equal(parsePagination({ perPage: "10000" }).perPage, MAX_PER_PAGE);
  });

  test("page negativa vira 1", () => {
    assert.equal(parsePagination({ page: "-5" }).page, 1);
  });

  test("offset acompanha a pagina", () => {
    assert.equal(parsePagination({ page: "3", perPage: "10" }).offset, 20);
  });
});
