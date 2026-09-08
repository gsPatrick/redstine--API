"use strict";

const cors = require("cors");
const { env } = require("../config/env");

/** Allowlist explicita. Sem origin (curl, server-to-server) e permitido. */
const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (env.cors.origins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origem nao permitida pelo CORS: ${origin}`));
  },
  credentials: true,
});

module.exports = { corsMiddleware };
