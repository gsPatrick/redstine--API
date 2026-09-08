"use strict";

const crypto = require("node:crypto");

/**
 * Referencia legivel para pedido/cotacao (ex.: RED-A7K3QP).
 * Base32 sem caracteres ambiguos (0/O, 1/I) para leitura por telefone.
 */
const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function gerarReferencia(prefixo = "RED", tamanho = 6) {
  const bytes = crypto.randomBytes(tamanho);
  let saida = "";
  for (let i = 0; i < tamanho; i += 1) {
    saida += ALFABETO[bytes[i] % ALFABETO.length];
  }
  return `${prefixo}-${saida}`;
}

module.exports = { gerarReferencia };
