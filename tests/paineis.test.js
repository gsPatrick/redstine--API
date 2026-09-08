"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);

const { janela } = require("../src/features/management/management.comercial");
const { janela: janelaCliente } = require("../src/features/me/me.dashboard");
const { statusDaCompra } = require("../src/features/me/me.painel");
const { permissoes, paraCSV } = require("../src/features/management/management.relatorios");
const { ORDER_STATUS, PICKUP_STATUS, CAPABILITIES } = require("../src/config/constants");

const dias = (a, b) => Math.round((b - a) / 86400000);

describe("filtro de período dos painéis", () => {
  test("gestão e área do cliente concordam no default de 30 dias", () => {
    assert.equal(dias(janela({}).desde, janela({}).ate), 30);
    assert.equal(dias(janelaCliente({}).desde, janelaCliente({}).ate), 30);
  });

  test("periodo=tudo não tem início — é o acumulado", () => {
    assert.equal(janela({ periodo: "tudo" }).desde, null);
    assert.equal(janelaCliente({ periodo: "tudo" }).desde, null);
  });

  test("datas explícitas vencem o atalho", () => {
    const j = janela({ periodo: "7d", desde: "2026-01-01", ate: "2026-03-01" });
    assert.equal(j.desde.toISOString().slice(0, 10), "2026-01-01");
  });
});

describe("status operacional da compra", () => {
  const base = { status: ORDER_STATUS.CONFIRMADO, pickupStatus: PICKUP_STATUS.AGUARDANDO };

  test("cancelado vence qualquer outro estado", () => {
    assert.equal(
      statusDaCompra({ ...base, status: ORDER_STATUS.CANCELADO, operationCompletedAt: new Date() }),
      "Cancelado"
    );
  });

  test("operação concluída vence retirada concluída", () => {
    assert.equal(
      statusDaCompra({
        ...base,
        pickupStatus: PICKUP_STATUS.CONCLUIDA,
        operationCompletedAt: new Date(),
      }),
      "Concluído"
    );
  });

  test("retirada agendada aparece antes de aguardando", () => {
    assert.equal(statusDaCompra({ ...base, pickupStatus: PICKUP_STATUS.AGENDADA }), "Retirada agendada");
    assert.equal(statusDaCompra(base), "Aguardando retirada");
  });

  test("pedido ainda não confirmado não diz que está aguardando retirada", () => {
    assert.equal(
      statusDaCompra({ ...base, status: ORDER_STATUS.AGUARDANDO_CONFIRMACAO }),
      "Aguardando confirmação"
    );
  });
});

describe("matriz de permissões exposta ao painel", () => {
  const m = permissoes();

  test("espelha exatamente as capacidades do backend", () => {
    assert.equal(m.capacidades.length, Object.values(CAPABILITIES).length);
  });

  test("comercial não alcança dado financeiro", () => {
    const c = m.perfis.find((p) => p.chave === "comercial");
    assert.ok(c.capacidades.includes(CAPABILITIES.COMMERCIAL_READ));
    assert.ok(!c.capacidades.includes(CAPABILITIES.FINANCIAL_READ));
  });

  test("fornecedor e comprador não acessam o painel de gestão", () => {
    for (const chave of ["fornecedor", "comprador"]) {
      assert.equal(m.perfis.find((p) => p.chave === chave).acessaPainelDeGestao, false);
    }
  });
});

describe("exportação CSV", () => {
  test("usa ; e BOM — o Excel pt-BR abre sem perguntar nada", () => {
    const csv = paraCSV({ colunas: ["a", "b"], linhas: [{ a: 1, b: 2 }] });
    assert.ok(csv.startsWith("﻿"));
    assert.ok(csv.includes("a;b"));
  });

  test("data vira ISO sem aspas duplicadas", () => {
    const csv = paraCSV({ colunas: ["d"], linhas: [{ d: new Date("2026-05-16T10:25:00Z") }] });
    assert.ok(csv.includes("2026-05-16T10:25:00.000Z"));
    assert.ok(!csv.includes('""'));
  });

  test("escapa separador dentro do texto", () => {
    const csv = paraCSV({ colunas: ["t"], linhas: [{ t: "Rio; RJ" }] });
    assert.ok(csv.includes('"Rio; RJ"'));
  });

  test("nulo vira célula vazia, não a palavra null", () => {
    const csv = paraCSV({ colunas: ["x"], linhas: [{ x: null }] });
    assert.ok(!csv.includes("null"));
  });
});
