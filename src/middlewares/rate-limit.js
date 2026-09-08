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

/** Limite mais apertado para login e registo — alvo classico de forca bruta. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Muitas tentativas. Tente mais tarde." } },
});

module.exports = { apiLimiter, authLimiter };
