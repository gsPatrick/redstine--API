"use strict";

const { env } = require("./env");

const base = {
  username: env.db.user,
  password: env.db.password,
  database: env.db.name,
  host: env.db.host,
  port: env.db.port,
  dialect: "postgres",
  dialectOptions: env.db.ssl
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {},
};

module.exports = { development: base, test: base, production: base };
