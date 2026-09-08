"use strict";

const { env } = require("../../config/env");
const manual = require("./manual.provider");

/**
 * Camada de gateway de pagamento.
 *
 * O dominio nunca fala com um PSP: fala com esta interface. Quando o cliente
 * decidir entre Mercado Pago, Asaas ou Pagar.me, nasce um ficheiro novo aqui e
 * a variavel PAYMENT_PROVIDER muda — nenhum service de pedido e tocado.
 *
 * Contrato que todo provider deve cumprir:
 *   criarCobranca({ order, metodo, pagador }) -> { providerId, metodo, status,
 *       valor, expiraEm, pix?, boleto?, checkoutUrl? }
 *   consultarCobranca(providerId) -> { providerId, status, pagoEm }
 *   cancelarCobranca(providerId)  -> { providerId, status }
 *   validarWebhook(req)           -> { valido, motivo? }
 *   interpretarWebhook(corpo)     -> { providerId, referencia, status, pagoEm }
 *
 * `status` e sempre um valor de PAYMENT_STATUS, ja traduzido pelo provider:
 * o vocabulario de cada PSP morre dentro do seu proprio ficheiro.
 */
const PROVIDERS = { manual };

function provider() {
  const escolhido = PROVIDERS[env.payments.provider];
  if (!escolhido) {
    throw new Error(
      `PAYMENT_PROVIDER "${env.payments.provider}" nao implementado. ` +
        `Disponiveis: ${Object.keys(PROVIDERS).join(", ")}.`
    );
  }
  return escolhido;
}

module.exports = {
  get nome() {
    return env.payments.provider;
  },
  criarCobranca: (...args) => provider().criarCobranca(...args),
  consultarCobranca: (...args) => provider().consultarCobranca(...args),
  cancelarCobranca: (...args) => provider().cancelarCobranca(...args),
  validarWebhook: (...args) => provider().validarWebhook(...args),
  interpretarWebhook: (...args) => provider().interpretarWebhook(...args),
};
