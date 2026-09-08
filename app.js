"use strict";

const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");

const { env, assertEnv } = require("./src/config/env");
const { sequelize } = require("./src/config/database");
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
app.use(
  `/${env.upload.dir}`,
  express.static(path.resolve(process.cwd(), env.upload.dir), {
    maxAge: "7d",
    fallthrough: true,
  })
);

app.use(env.app.apiPrefix, apiLimiter, routes);

app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  try {
    await sequelize.authenticate();
    console.log("[db] conexao estabelecida");
  } catch (err) {
    console.error("[db] falha ao conectar:", err.message);
    process.exit(1);
  }

  app.listen(env.app.port, () => {
    console.log(`[api] a ouvir em http://localhost:${env.app.port}${env.app.apiPrefix}`);
    console.log(`[api] ambiente: ${env.nodeEnv}`);
  });
}

if (require.main === module) start();

module.exports = app;
