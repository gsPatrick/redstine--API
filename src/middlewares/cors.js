"use strict";

const cors = require("cors");
const { env } = require("../config/env");
const { AppError } = require("../utils/app-error");

/**
 * CORS.
 *
 * Dois modos, escolhidos por configuração:
 *
 *   CORS_ORIGINS=*        qualquer origem. A resposta REFLETE a origem que
 *                         pediu, em vez de devolver "*" literal — com "*" o
 *                         navegador recusa requisições com credenciais, e a
 *                         reflexão mantém as duas coisas funcionando.
 *
 *   CORS_ORIGINS=a,b,c    allowlist. Origem fora da lista recebe 403 com o
 *                         código CORS_ORIGIN_NOT_ALLOWED e a lista aceita.
 *
 * Sobre abrir para qualquer origem: aqui o risco é menor do que o habitual
 * porque a sessão é um Bearer token guardado no localStorage, que é isolado
 * por origem — um site de terceiros não consegue lê-lo nem viajar de carona
 * na sessão do utilizador. O que a abertura permite é qualquer front chamar
 * esta API diretamente.
 *
 * ATENÇÃO: se um dia a autenticação passar a usar COOKIE, esta abertura vira
 * um buraco de CSRF e precisa voltar a ser uma allowlist.
 */
const aberto = env.cors.origins.includes("*");

const corsMiddleware = cors({
  origin(origin, callback) {
    // Sem origin: curl, servidor-para-servidor, healthcheck. Não há navegador
    // para proteger.
    if (!origin) return callback(null, true);

    if (aberto || env.cors.origins.includes(origin)) return callback(null, true);

    return callback(
      AppError.forbidden(
        `Origem não permitida: ${origin}. Inclua-a em CORS_ORIGINS, defina APP_SITE_URL, ou use CORS_ORIGINS=* para liberar todas.`,
        "CORS_ORIGIN_NOT_ALLOWED",
        { permitidas: env.cors.origins }
      )
    );
  },
  credentials: true,
});

module.exports = { corsMiddleware, aberto };
