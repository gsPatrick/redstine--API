"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);
const { ASSET_TRANSICOES, ASSET_STATUS } = require("../src/config/constants");

describe("maquina de estados do ativo", () => {
  test("rascunho so vai para curadoria ou arquivo", () => {
    assert.deepEqual(ASSET_TRANSICOES.rascunho, ["em_avaliacao", "inativo"]);
  });

  test("nao existe atalho de rascunho para publicado", () => {
    assert.ok(!ASSET_TRANSICOES.rascunho.includes(ASSET_STATUS.PUBLICADO));
  });

  test("nao existe atalho de curadoria para publicado", () => {
    assert.ok(!ASSET_TRANSICOES.em_avaliacao.includes(ASSET_STATUS.PUBLICADO));
  });

  test("publicado so vem de aprovado", () => {
    const origens = Object.entries(ASSET_TRANSICOES)
      .filter(([, destinos]) => destinos.includes(ASSET_STATUS.PUBLICADO))
      .map(([origem]) => origem);
    assert.deepEqual(origens, [ASSET_STATUS.APROVADO]);
  });

  test("inativo e terminal", () => {
    assert.deepEqual(ASSET_TRANSICOES.inativo, []);
  });

  test("todo status tem transicoes declaradas", () => {
    for (const status of Object.values(ASSET_STATUS)) {
      assert.ok(
        Array.isArray(ASSET_TRANSICOES[status]),
        `status "${status}" sem transicoes declaradas`
      );
    }
  });
});

describe("desconto sobre o preco de mercado", () => {
  // Replica Asset.prototype.descontoPercentual sem tocar no banco.
  const desconto = (price, marketPrice) => {
    const p = Number(price);
    const m = Number(marketPrice);
    if (!Number.isFinite(p) || !Number.isFinite(m) || m <= 0) return null;
    if (p >= m) return 0;
    return Math.round((1 - p / m) * 100);
  };

  test("metade do preco de mercado da 50%", () => {
    assert.equal(desconto(50, 100), 50);
  });

  test("sem preco de mercado nao ha desconto", () => {
    assert.equal(desconto(50, null), null);
  });

  test("preco acima do mercado devolve zero, nao negativo", () => {
    assert.equal(desconto(120, 100), 0);
  });

  test("o caso do smoke test: 18,50 sobre 42,00 da 56%", () => {
    assert.equal(desconto(18.5, 42), 56);
  });
});
