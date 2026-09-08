"use strict";

const db = require("../../models");
const { env } = require("../../config/env");
const gateway = require("../../providers/payments");
const { AppError } = require("../../utils/app-error");
const audit = require("../audit/audit.service");
const ordersService = require("../orders/orders.service");
const { PAYMENT_STATUS, ORDER_STATUS } = require("../../config/constants");

/**
 * Checkout e conciliacao.
 *
 * O modelo e CUSTODIA, nao split automatico: a RED recebe o valor integral e
 * repassa o fornecedor depois. Split no ato da compra entregaria dinheiro ao
 * fornecedor antes da retirada — e a regra oficial e que o valor so se torna
 * devido apos a conclusao integral da operacao, com 48h de prazo a partir dali.
 * Um estorno antes da retirada, com split ja executado, viraria cobranca
 * manual contra o fornecedor.
 */

function metodoValido(metodo) {
  if (!env.payments.metodos.includes(metodo)) {
    throw AppError.badRequest(`Metodo de pagamento nao habilitado: ${metodo}.`, "METHOD_DISABLED", {
      habilitados: env.payments.metodos,
    });
  }
}

async function pedidoPagavel(orderId) {
  const order = await db.Order.findByPk(orderId);
  if (!order) throw AppError.notFound("Pedido nao encontrado.", "ORDER_NOT_FOUND");

  if (order.status === ORDER_STATUS.CANCELADO) {
    throw AppError.unprocessable("Pedido cancelado.", "ORDER_CANCELLED");
  }
  if (order.paymentStatus === PAYMENT_STATUS.PAGO) {
    throw AppError.unprocessable("Pedido ja pago.", "ORDER_ALREADY_PAID");
  }
  return order;
}

/** Abre a cobranca no gateway e guarda a referencia dentro do pedido. */
async function iniciar(orderId, { metodo, pagador } = {}) {
  metodoValido(metodo);
  const order = await pedidoPagavel(orderId);

  const cobranca = await gateway.criarCobranca({ order, metodo, pagador });

  await order.update({
    paymentMethod: metodo,
    paymentStatus: PAYMENT_STATUS.AGUARDANDO,
    billing: {
      ...order.billing,
      provider: gateway.nome,
      modo: env.payments.modo,
      paymentReference: cobranca.providerId,
      metodo,
      expiraEm: cobranca.expiraEm,
    },
  });

  await audit.registrar({
    entity: "order",
    entityId: order.id,
    action: "cobranca_criada",
    depois: { provider: gateway.nome, metodo, providerId: cobranca.providerId },
  });

  return { orderId: order.id, reference: order.reference, ...cobranca };
}

async function status(orderId) {
  const order = await db.Order.findByPk(orderId);
  if (!order) throw AppError.notFound("Pedido nao encontrado.", "ORDER_NOT_FOUND");

  const providerId = order.billing?.paymentReference || null;
  const remoto = providerId ? await gateway.consultarCobranca(providerId) : null;

  return {
    orderId: order.id,
    reference: order.reference,
    metodo: order.paymentMethod,
    // O estado local manda: o webhook ja o atualizou, e e ele que a operacao
    // financeira usa. A consulta remota serve para conferencia.
    status: order.paymentStatus,
    providerId,
    statusNoProvider: remoto?.status || null,
    confirmadoEm: order.paymentConfirmedAt,
  };
}

/**
 * Entrada do webhook do PSP.
 *
 * Idempotente por construcao: se o pedido ja esta no status recebido, nada
 * acontece. Um PSP reenvia o mesmo evento varias vezes e nao pode gerar duas
 * confirmacoes de pagamento — nem duas vezes o mesmo repasse.
 */
async function processarWebhook(req) {
  const validacao = gateway.validarWebhook(req);
  if (!validacao.valido) {
    throw AppError.unauthorized(validacao.motivo || "Webhook nao autenticado.", "WEBHOOK_INVALID");
  }

  const evento = gateway.interpretarWebhook(req.body);
  if (!evento) return { ignorado: true, motivo: "Evento sem efeito no dominio." };

  const order = await db.Order.findOne({
    where: evento.referencia
      ? { reference: evento.referencia }
      : { billing: { paymentReference: evento.providerId } },
  });

  if (!order) {
    // 200 com ignorado: erro aqui faz o PSP reenviar para sempre um evento
    // que nunca vai encontrar dono.
    return { ignorado: true, motivo: "Pedido nao localizado para o evento." };
  }

  if (order.paymentStatus === evento.status) {
    return { ignorado: true, motivo: "Evento repetido.", orderId: order.id };
  }

  const atualizado = await ordersService.registrarPagamento(order.id, {
    status: evento.status,
    reference: evento.providerId,
    ator: { id: null, role: `webhook:${gateway.nome}` },
  });

  return { ignorado: false, orderId: order.id, status: evento.status, order: atualizado };
}

/** Metodos que o front deve renderizar no checkout. */
function metodosDisponiveis() {
  return {
    provider: gateway.nome,
    modo: env.payments.modo,
    metodos: env.payments.metodos,
    conferenciaManual: gateway.nome === "manual",
  };
}

module.exports = { iniciar, status, processarWebhook, metodosDisponiveis };
