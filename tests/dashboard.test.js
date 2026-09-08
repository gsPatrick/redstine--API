"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);
const { janela } = require("../src/features/management/management.service");
const { CAPS_POR_PAPEL, CAPABILITIES, ROLES } = require("../src/config/constants");

const dias = (a, b) => Math.round((b - a) / 86400000);

describe("filtro de periodo do painel", () => {
  test("periodo omitido cai em 30 dias", () => {
    const { desde, ate } = janela({});
    assert.equal(dias(desde, ate), 30);
  });

  test("cada atalho abre a janela correspondente", () => {
    for (const [periodo, esperado] of [["7d", 7], ["30d", 30], ["90d", 90], ["12m", 365]]) {
      const { desde, ate } = janela({ periodo });
      assert.equal(dias(desde, ate), esperado, periodo);
    }
  });

  test("periodo=tudo nao tem inicio — e o acumulado, nao uma janela larga", () => {
    assert.equal(janela({ periodo: "tudo" }).desde, null);
  });

  test("datas explicitas vencem o atalho", () => {
    const { desde, ate } = janela({
      periodo: "7d",
      desde: "2026-01-01",
      ate: "2026-03-01",
    });
    assert.equal(desde.toISOString().slice(0, 10), "2026-01-01");
    assert.equal(ate.toISOString().slice(0, 10), "2026-03-01");
  });
});

describe("separacao de acesso ao painel (secao 19)", () => {
  test("comercial nao alcanca dado financeiro", () => {
    const caps = CAPS_POR_PAPEL[ROLES.COMERCIAL];
    assert.ok(caps.includes(CAPABILITIES.COMMERCIAL_READ));
    assert.ok(!caps.includes(CAPABILITIES.FINANCIAL_READ));
  });

  test("financeiro nao alcanca dado comercial", () => {
    const caps = CAPS_POR_PAPEL[ROLES.FINANCEIRO];
    assert.ok(caps.includes(CAPABILITIES.FINANCIAL_READ));
    assert.ok(!caps.includes(CAPABILITIES.COMMERCIAL_READ));
  });

  test("fornecedor e comprador nao tem capacidade de gestao", () => {
    for (const papel of [ROLES.FORNECEDOR, ROLES.COMPRADOR]) {
      assert.equal((CAPS_POR_PAPEL[papel] || []).length, 0, papel);
    }
  });

  test("admin alcanca tudo", () => {
    const caps = CAPS_POR_PAPEL[ROLES.ADMIN];
    for (const c of Object.values(CAPABILITIES)) assert.ok(caps.includes(c), c);
  });
});
