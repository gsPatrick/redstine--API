"use strict";

const { Sequelize } = require("sequelize");
const { env } = require("./env");

const sequelize = new Sequelize(env.db.name, env.db.user, env.db.password, {
  host: env.db.host,
  port: env.db.port,
  dialect: "postgres",
  logging: env.db.logging ? (msg) => console.log(msg) : false,
  dialectOptions: env.db.ssl
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {},
  define: {
    underscored: true,
    timestamps: true,
  },
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
});

module.exports = { sequelize };
