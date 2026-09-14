"use strict";

const rateLimit = require("express-rate-limit");
const { env } = require("../config/env");

const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Muitas requisicoes. Tente mais tarde." } },
});

/**
 * Limite mais apertado para login e registo — alvo classico de forca bruta.
 *
 * Configuravel, com 20 de default: em producao 20 tentativas por IP a cada 15
 * minutos e o que se quer, mas os verificadores (`check:acoes`, `smoke`) fazem
 * seis logins por execucao e ficavam impossiveis de repetir — o teste falhava
 * por limite e nao por regressao, que e a pior especie de falso negativo.
 */
const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Muitas tentativas. Tente mais tarde." } },
});

module.exports = { apiLimiter, authLimiter };
