"use strict";

/** Slug estavel a partir de um titulo, sem acento e sem caractere especial. */
function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

/** Acrescenta sufixo numerico ate o slug ficar livre na tabela. */
async function slugUnico(Model, base, { ignoreId = null } = {}) {
  const raiz = slugify(base) || "item";
  let tentativa = raiz;
  let n = 1;
  const { Op } = require("sequelize");

  for (;;) {
    const where = { slug: tentativa };
    if (ignoreId) where.id = { [Op.ne]: ignoreId };
    const existente = await Model.findOne({ where, paranoid: false });
    if (!existente) return tentativa;
    n += 1;
    tentativa = `${raiz}-${n}`;
  }
}

module.exports = { slugify, slugUnico };
