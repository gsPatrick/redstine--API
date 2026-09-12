"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);

const {
  CANAIS_VENDA,
  ROTULO_CANAL_VENDA,
  JANELA_VISUALIZACAO_MINUTOS,
} = require("../src/config/constants");
const { vendaExternaSchema } = require("../src/features/orders/orders.schemas");
const { chaveDoVisitante } = require("../src/features/events/events.service");

/**
 * Estes testes cobrem a parte das regras que NAO precisa de banco: o vocabulario
 * do canal, o que o schema da venda externa aceita e recusa, e a chave de
 * deduplicacao da visualizacao. O resto — baixa de estoque, repasse, isolamento
 * por fornecedor — e provado contra a API a correr, em scripts/acoes.mjs.
 */

describe("canal da venda (revisao do cliente, item 11)", () => {
  test("site continua a existir: e o canal dos pedidos que ja estavam gravados", () => {
    assert.equal(CANAIS_VENDA.SITE, "site");
  });

  test("todo canal tem rotulo de tela — um canal sem nome apareceria vazio na coluna", () => {
    for (const canal of Object.values(CANAIS_VENDA)) {
      assert.ok(ROTULO_CANAL_VENDA[canal], `canal sem rotulo: ${canal}`);
    }
  });

  test("os canais que a RED usa de facto estao previstos", () => {
    for (const esperado of ["whatsapp", "telefone"]) {
      assert.ok(Object.values(CANAIS_VENDA).includes(esperado));
    }
  });
});

describe("schema da venda fora do site", () => {
  const base = {
    buyerName: "Comprador do WhatsApp",
    buyerEmail: "comprador@exemplo.com",
    paymentMethod: "pix",
    items: [{ assetId: "11111111-1111-4111-8111-111111111111", quantity: 2 }],
  };

  test("aceita a venda de WhatsApp com preco negociado", () => {
    const r = vendaExternaSchema.safeParse({
      ...base,
      channel: "whatsapp",
      items: [{ ...base.items[0], unitPrice: 120.5 }],
    });
    assert.ok(r.success);
    assert.equal(r.data.items[0].unitPrice, 120.5);
  });

  test("recusa sem canal: sem ele a venda fica indistinguivel do checkout", () => {
    assert.equal(vendaExternaSchema.safeParse(base).success, false);
  });

  test("recusa o canal `site`: registrar a mao como site tornaria a coluna inutil", () => {
    assert.equal(vendaExternaSchema.safeParse({ ...base, channel: "site" }).success, false);
  });

  test("preco na linha e opcional — sem ele vale o preco do catalogo", () => {
    const r = vendaExternaSchema.safeParse({ ...base, channel: "telefone" });
    assert.ok(r.success);
    assert.equal(r.data.items[0].unitPrice, undefined);
  });

  test("preco zero ou negativo e recusado, nao aceito como `sem preco`", () => {
    for (const unitPrice of [0, -10]) {
      const r = vendaExternaSchema.safeParse({
        ...base,
        channel: "telefone",
        items: [{ ...base.items[0], unitPrice }],
      });
      assert.equal(r.success, false, `aceitou unitPrice ${unitPrice}`);
    }
  });

  test("pagamento e retirada podem vir na mesma chamada", () => {
    const r = vendaExternaSchema.safeParse({
      ...base,
      channel: "presencial",
      paymentStatus: "pago",
      pickupStatus: "concluida",
    });
    assert.ok(r.success);
  });
});

describe("deduplicacao da visualizacao (revisao do cliente, item 33)", () => {
  test("o utilizador autenticado manda: vale mais do que qualquer cookie", () => {
    const chave = chaveDoVisitante({ userId: "u1", sessionId: "s1", ip: "1.2.3.4" });
    assert.equal(chave, "u:u1");
  });

  test("visitante anonimo e identificado pela sessao do navegador", () => {
    assert.equal(chaveDoVisitante({ sessionId: "abc" }), "s:abc");
  });

  test("sem sessao, recai numa impressao de IP + user-agent", () => {
    const chave = chaveDoVisitante({ ip: "1.2.3.4", userAgent: "Firefox" });
    assert.match(chave, /^a:[0-9a-f]{60}$/);
  });

  test("a impressao e estavel — se mudasse a cada visita, o F5 voltava a contar", () => {
    const um = chaveDoVisitante({ ip: "1.2.3.4", userAgent: "Firefox" });
    const dois = chaveDoVisitante({ ip: "1.2.3.4", userAgent: "Firefox" });
    assert.equal(um, dois);
  });

  test("visitantes diferentes nao colidem", () => {
    const um = chaveDoVisitante({ ip: "1.2.3.4", userAgent: "Firefox" });
    const dois = chaveDoVisitante({ ip: "9.9.9.9", userAgent: "Firefox" });
    assert.notEqual(um, dois);
  });

  test("o IP nao viaja em claro na chave: ela serve para comparar, nao para identificar", () => {
    assert.ok(!chaveDoVisitante({ ip: "1.2.3.4", userAgent: "x" }).includes("1.2.3.4"));
  });

  test("a janela de deduplicacao e de horas, nao de segundos", () => {
    assert.ok(JANELA_VISUALIZACAO_MINUTOS >= 60);
  });
});
