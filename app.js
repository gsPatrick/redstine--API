"use strict";

const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");

const { env, assertEnv } = require("./src/config/env");
const { sequelize } = require("./src/config/database");
const { prepararBanco } = require("./src/config/bootstrap");
const { corsMiddleware } = require("./src/middlewares/cors");
const { apiLimiter } = require("./src/middlewares/rate-limit");
const { notFoundHandler, errorHandler } = require("./src/middlewares/error-handler");
const routes = require("./src/routes");

assertEnv();

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(helmet());
app.use(corsMiddleware);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.isProduction ? "combined" : "dev"));

// Ficheiros enviados. Em producao com varias instancias isto sai para um
// bucket — ver src/providers/storage.
//
// O helmet marca tudo como Cross-Origin-Resource-Policy: same-origin, o que e
// o default certo para respostas da API mas errado para estas: sao imagens
// feitas para serem exibidas pelo site, que vive noutro dominio. Com
// same-origin o browser BAIXA a imagem e recusa-se a desenha-la
// (ERR_BLOCKED_BY_RESPONSE.NotSameOrigin) — nao ha erro no servidor, nada
// aparece no log, e a foto simplesmente nao aparece na tela.
app.use(
  `/${env.upload.dir}`,
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.resolve(process.cwd(), env.upload.dir), {
    maxAge: "7d",
    fallthrough: true,
  })
);

app.use(env.app.apiPrefix, apiLimiter, routes);

app.use(notFoundHandler);
app.use(errorHandler);

/**
 * Espera o banco aceitar conexão.
 *
 * Num deploy, a API e o Postgres sobem juntos e a API costuma ficar pronta
 * primeiro. Sem esta espera o contêiner morre no primeiro segundo, o
 * orquestrador reinicia, e o ciclo se repete até dar sorte — com falhas no log
 * que parecem erro de configuração e não são.
 */
async function esperarBanco(tentativas = 12, intervaloMs = 3000) {
  for (let i = 1; i <= tentativas; i += 1) {
    try {
      await sequelize.authenticate();
      console.log("[db] conexao estabelecida");
      return;
    } catch (err) {
      if (i === tentativas) {
        console.error(`[db] falha ao conectar apos ${tentativas} tentativas:`, err.message);
        process.exit(1);
      }
      console.log(`[db] indisponivel (${i}/${tentativas}), nova tentativa em ${intervaloMs / 1000}s…`);
      await new Promise((r) => setTimeout(r, intervaloMs));
    }
  }
}

async function start() {
  await esperarBanco();

  // Migrações, seed e catálogo inicial. O passo do catálogo só roda quando o
  // banco não tem ativo nenhum — ver src/config/bootstrap.js.
  try {
    const db = require("./src/models");
    await prepararBanco(db);
  } catch (err) {
    console.error("[bootstrap]", err.message);
    process.exit(1);
  }

  const servidor = app.listen(env.app.port, () => {
    console.log(`[api] a ouvir em http://localhost:${env.app.port}${env.app.apiPrefix}`);
    console.log(`[api] ambiente: ${env.nodeEnv}`);
  });

  /**
   * Encerramento limpo.
   *
   * O orquestrador manda SIGTERM e espera. Sem tratar, o processo morre no
   * meio das requisições em curso — um comprador podia perder o pedido que
   * acabou de enviar durante um deploy.
   */
  for (const sinal of ["SIGTERM", "SIGINT"]) {
    process.on(sinal, () => {
      console.log(`[api] ${sinal} recebido, encerrando…`);
      servidor.close(async () => {
        await sequelize.close().catch(() => {});
        process.exit(0);
      });
      // Rede de segurança: se alguma conexão travar, não fica preso para sempre.
      setTimeout(() => process.exit(0), 10000).unref();
    });
  }
}

if (require.main === module) start();

module.exports = app;
