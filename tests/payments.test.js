"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);
const gateway = require("../src/providers/payments");
const { PAYMENT_STATUS } = require("../src/config/constants");
const { env } = require("../src/config/env");

describe("camada de gateway", () => {
  test("o provider default e o manual — o modo real de operacao hoje", () => {
    assert.equal(gateway.nome, "manual");
  });

  test("o modo e custodia: split no ato da compra contradiz o prazo de 48h", () => {
    assert.equal(env.payments.modo, "custodia");
  });

  test("cobranca nasce aguardando, nunca paga", async () => {
    const c = await gateway.criarCobranca({ order: { total: 1000 }, metodo: "pix" });
    assert.equal(c.status, PAYMENT_STATUS.AGUARDANDO);
    assert.equal(c.valor, 1000);
    assert.ok(c.providerId);
  });

  test("boleto vence em dias, pix em minutos", async () => {
    const agora = Date.now();
    const pix = await gateway.criarCobranca({ order: { total: 10 }, metodo: "pix" });
    const boleto = await gateway.criarCobranca({ order: { total: 10 }, metodo: "boleto" });
    assert.ok(pix.expiraEm.getTime() < boleto.expiraEm.getTime());
    assert.ok(pix.expiraEm.getTime() > agora);
  });

  test("o provider manual recusa webhook — nao ha assinatura para validar", () => {
    assert.equal(gateway.validarWebhook({}).valido, false);
  });
});
