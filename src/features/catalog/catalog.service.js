"use strict";

const db = require("../../models");
const { AppError } = require("../../utils/app-error");
const { slugify } = require("../../utils/slug");

async function listarCategorias({ comSubcategorias = true } = {}) {
  return db.Category.findAll({
    where: { active: true },
    order: [["position", "ASC"], ["name", "ASC"]],
    include: comSubcategorias
      ? [
          {
            model: db.Subcategory,
            as: "subcategorias",
            where: { active: true },
            required: false,
            attributes: ["id", "slug", "name", "position"],
          },
        ]
      : [],
    order: [
      ["position", "ASC"],
      [{ model: db.Subcategory, as: "subcategorias" }, "position", "ASC"],
    ],
  });
}

async function categoriaPorSlug(slug) {
  const categoria = await db.Category.findOne({
    where: { slug },
    include: [
      {
        model: db.Subcategory,
        as: "subcategorias",
        where: { active: true },
        required: false,
        attributes: ["id", "slug", "name", "position"],
      },
    ],
    order: [[{ model: db.Subcategory, as: "subcategorias" }, "position", "ASC"]],
  });
  if (!categoria) throw AppError.notFound("Categoria nao encontrada.", "CATEGORY_NOT_FOUND");
  return categoria;
}

async function criarCategoria(dados) {
  return db.Category.create({ ...dados, slug: dados.slug || slugify(dados.name) });
}

async function atualizarCategoria(id, dados) {
  const categoria = await db.Category.findByPk(id);
  if (!categoria) throw AppError.notFound("Categoria nao encontrada.", "CATEGORY_NOT_FOUND");
  await categoria.update(dados);
  return categoria;
}

async function criarSubcategoria(dados) {
  const categoria = await db.Category.findByPk(dados.categoryId);
  if (!categoria) throw AppError.badRequest("Categoria invalida.", "CATEGORY_INVALID");
  return db.Subcategory.create({ ...dados, slug: dados.slug || slugify(dados.name) });
}

async function atualizarSubcategoria(id, dados) {
  const sub = await db.Subcategory.findByPk(id);
  if (!sub) throw AppError.notFound("Subcategoria nao encontrada.", "SUBCATEGORY_NOT_FOUND");
  await sub.update(dados);
  return sub;
}

module.exports = {
  listarCategorias,
  categoriaPorSlug,
  criarCategoria,
  atualizarCategoria,
  criarSubcategoria,
  atualizarSubcategoria,
};
