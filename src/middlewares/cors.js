"use strict";

const cors = require("cors");
const { env } = require("../config/env");
const { AppError } = require("../utils/app-error");

/**
 * Allowlist explícita.
 *
 * Sem `origin` (curl, servidor-para-servidor) é permitido — não há navegador
 * para proteger. Origem desconhecida é recusada com 403 e mensagem que diz
 * o que fazer.
 *
 * Antes o erro genérico virava 500, e o log da API mostrava "erro interno"
 * para o que é, na verdade, uma configuração faltando. Quem estava a subir o
 * sistema perdia tempo procurando defeito no lugar errado.
 */
const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (env.cors.origins.includes(origin)) return callback(null, true);

    return callback(
      AppError.forbidden(
        `Origem não permitida: ${origin}. Inclua-a em CORS_ORIGINS ou defina APP_SITE_URL.`,
        "CORS_ORIGIN_NOT_ALLOWED",
        { permitidas: env.cors.origins }
      )
    );
  },
  credentials: true,
});

module.exports = { corsMiddleware };
