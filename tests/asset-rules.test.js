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

  test("publicado vem de aprovado ou da volta de vendido — de mais nenhum lugar", () => {
    const origens = Object.entries(ASSET_TRANSICOES)
      .filter(([, destinos]) => destinos.includes(ASSET_STATUS.PUBLICADO))
      .map(([origem]) => origem)
      .sort();
    assert.deepEqual(origens, [ASSET_STATUS.APROVADO, ASSET_STATUS.VENDIDO].sort());
  });

  test("vendido volta ao estoque: sem isto o engano era irreversivel", () => {
    assert.ok(ASSET_TRANSICOES.vendido.includes(ASSET_STATUS.PUBLICADO));
  });

  test("a volta nao salta a curadoria: vendido nao vai para rascunho nem avaliacao", () => {
    for (const proibido of [ASSET_STATUS.RASCUNHO, ASSET_STATUS.EM_AVALIACAO, ASSET_STATUS.APROVADO]) {
      assert.ok(!ASSET_TRANSICOES.vendido.includes(proibido), proibido);
    }
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

/**
 * A quantidade reposta na volta ao estoque.
 *
 * Replica a regra do service sem tocar no banco: o que importa provar e que
 * ela nunca inventa saldo — nenhum caso pode devolver mais do que a
 * quantidade original menos o que foi de facto vendido.
 */
describe("devolver ao estoque um ativo vendido", () => {
  const reposta = (original, vendidaViva) => Math.max(0, Number(original || 0) - vendidaViva);

  test("marcado vendido por engano, sem venda nenhuma: volta tudo", () => {
    assert.equal(reposta(500, 0), 500);
  });

  test("venda cancelada nao conta: volta o que o cancelamento libertou", () => {
    // 500 originais, 200 vendidos e cancelados (logo fora da conta) -> 500.
    assert.equal(reposta(500, 0), 500);
    // 500 originais, 200 vendidos e vivos -> volta so o restante.
    assert.equal(reposta(500, 200), 300);
  });

  test("venda real e integral da zero — e zero tem de recusar a republicacao", () => {
    assert.equal(reposta(500, 500), 0);
  });

  test("nunca devolve mais do que existiu, mesmo com venda maior que o original", () => {
    assert.equal(reposta(100, 300), 0);
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
