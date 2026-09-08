"use strict";

const crypto = require("crypto");
const { env } = require("../../config/env");
const { PAYMENT_STATUS } = require("../../config/constants");

/**
 * Provider manual — o modo de operacao atual da RED.
 *
 * Gera a instrucao de pagamento (chave PIX, dados bancarios) e deixa a
 * confirmacao com o financeiro, via POST /orders/:id/payment. Nao inventa
 * QR Code nem linha digitavel: emitir um codigo que nenhum banco reconhece
 * seria pior do que nao emitir nenhum.
 */

const REFERENCIA = () => `MAN-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;

async function criarCobranca({ order, metodo }) {
  const agora = new Date();
  const expira = new Date(agora);

  if (metodo === "boleto") {
    expira.setDate(expira.getDate() + env.payments.boletoDiasVencimento);
  } else {
    expira.setMinutes(expira.getMinutes() + env.payments.pixExpiraMinutos);
  }

  return {
    providerId: REFERENCIA(),
    metodo,
    status: PAYMENT_STATUS.AGUARDANDO,
    valor: Number(order.total),
    expiraEm: expira,
    instrucoes:
      metodo === "pix"
        ? "Pagamento por PIX: a equipe RED envia a chave e confirma o recebimento."
        : "A equipe RED envia os dados de pagamento e confirma o recebimento.",
    conferenciaManual: true,
  };
}

async function consultarCobranca(providerId) {
  // Nao ha o que consultar: a fonte da verdade e o proprio pedido.
  return { providerId, status: null, pagoEm: null };
}

async function cancelarCobranca(providerId) {
  return { providerId, status: PAYMENT_STATUS.ESTORNADO };
}

function validarWebhook() {
  return { valido: false, motivo: "Provider manual nao recebe webhook." };
}

function interpretarWebhook() {
  return null;
}

module.exports = {
  criarCobranca,
  consultarCobranca,
  cancelarCobranca,
  validarWebhook,
  interpretarWebhook,
};
