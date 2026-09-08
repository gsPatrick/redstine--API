"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { sequelize } = require("../config/database");

const db = {};

fs.readdirSync(__dirname)
  .filter((f) => f.endsWith(".js") && f !== "index.js")
  .forEach((f) => {
    const model = require(path.join(__dirname, f))(sequelize);
    db[model.name] = model;
  });

// Associacoes so depois de todos os models existirem.
Object.values(db).forEach((model) => {
  if (typeof model.associate === "function") model.associate(db);
});

db.sequelize = sequelize;

module.exports = db;
