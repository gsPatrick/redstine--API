"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);
const { percentualDoFornecedor } = require("../src/features/payouts/payouts.service");
const { MODELOS_COMERCIAIS } = require("../src/config/constants");

describe("repasse por modelo comercial", () => {
  test("RED Estoque devolve 50% ao fornecedor", () => {
    assert.equal(percentualDoFornecedor(MODELOS_COMERCIAIS.ESTOQUE), 50);
  });

  test("RED Catalogo devolve 65% ao fornecedor", () => {
    assert.equal(percentualDoFornecedor(MODELOS_COMERCIAIS.CATALOGO), 65);
  });

  test("modelo desconhecido cai no catalogo (o mais conservador para a RED)", () => {
    assert.equal(percentualDoFornecedor("inexistente"), 65);
  });
});

const { calcular, ratearCustos } = require("../src/features/payouts/payouts.service");

describe("regra financeira-mestre: split sobre o LIQUIDO", () => {
  test("o exemplo do documento oficial", () => {
    // Venda R$ 10.000, transporte aprovado R$ 1.000, RED Catalogo 65/35.
    // Liquido R$ 9.000 -> fornecedor R$ 5.850, RED R$ 3.150.
    const r = calcular({ bruto: 10000, custos: 1000, percentualFornecedor: 65 });
    assert.equal(r.netAmount, 9000);
    assert.equal(r.supplierAmount, 5850);
    assert.equal(r.redAmount, 3150);
  });

  test("dividir sobre o bruto daria valor errado — a diferenca importa", () => {
    const certo = calcular({ bruto: 10000, custos: 1000, percentualFornecedor: 65 });
    const errado = Number(((10000 * 65) / 100).toFixed(2));
    assert.equal(errado, 6500);
    assert.equal(certo.supplierAmount, 5850);
    assert.equal(errado - certo.supplierAmount, 650);
  });

  test("sem custos, liquido e igual ao bruto", () => {
    const r = calcular({ bruto: 1000, custos: 0, percentualFornecedor: 50 });
    assert.equal(r.netAmount, 1000);
    assert.equal(r.supplierAmount, 500);
    assert.equal(r.redAmount, 500);
  });

  test("custo maior que o bruto zera o liquido, nunca fica negativo", () => {
    const r = calcular({ bruto: 100, custos: 500, percentualFornecedor: 65 });
    assert.equal(r.netAmount, 0);
    assert.equal(r.supplierAmount, 0);
    assert.equal(r.redAmount, 0);
  });

  test("percentual da RED e sempre o complemento", () => {
    for (const p of [50, 65, 35, 60]) {
      assert.equal(calcular({ bruto: 100, custos: 0, percentualFornecedor: p }).redPercent, 100 - p);
    }
  });
});

describe("divisao de valores", () => {
  test("soma das partes bate exatamente com o liquido", () => {
    for (const bruto of [100, 33.33, 0.01, 1234.56, 9999.99, 0.05]) {
      for (const custos of [0, 0.01, 10]) {
        for (const percent of [50, 65, 35]) {
          const r = calcular({ bruto, custos, percentualFornecedor: percent });
          assert.equal(
            Number((r.supplierAmount + r.redAmount).toFixed(2)),
            r.netAmount,
            `bruto ${bruto}, custos ${custos}, ${percent}%`
          );
        }
      }
    }
  });

  test("valor impar em 50/50 nao cria centavo do nada", () => {
    const r = calcular({ bruto: 0.01, custos: 0, percentualFornecedor: 50 });
    assert.equal(r.supplierAmount + r.redAmount, 0.01);
  });
});

describe("rateio de custos entre itens", () => {
  const itens = [
    { id: "a", total: 6000 },
    { id: "b", total: 4000 },
  ];

  test("custo do pedido rateia pela participacao no bruto", () => {
    const mapa = ratearCustos(itens, [{ amount: 1000, orderItemId: null }]);
    assert.equal(mapa.get("a"), 600);
    assert.equal(mapa.get("b"), 400);
  });

  test("custo com item vinculado nao rateia", () => {
    const mapa = ratearCustos(itens, [{ amount: 300, orderItemId: "b" }]);
    assert.equal(mapa.get("a"), 0);
    assert.equal(mapa.get("b"), 300);
  });

  test("a soma do rateio fecha com o total, sem sobra de centavo", () => {
    const mapa = ratearCustos(
      [
        { id: "a", total: 33.33 },
        { id: "b", total: 33.33 },
        { id: "c", total: 33.34 },
      ],
      [{ amount: 10, orderItemId: null }]
    );
    const soma = [...mapa.values()].reduce((x, y) => x + y, 0);
    assert.equal(Number(soma.toFixed(2)), 10);
  });
});
