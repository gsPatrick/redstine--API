"use strict";

const service = require("./catalog.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, created } = require("../../utils/http-response");

const listarCategorias = catchAsync(async (req, res) => {
  ok(res, await service.listarCategorias());
});

const categoriaPorSlug = catchAsync(async (req, res) => {
  ok(res, await service.categoriaPorSlug(req.params.slug));
});

const criarCategoria = catchAsync(async (req, res) => {
  created(res, await service.criarCategoria(req.body));
});

const atualizarCategoria = catchAsync(async (req, res) => {
  ok(res, await service.atualizarCategoria(req.params.id, req.body));
});

const criarSubcategoria = catchAsync(async (req, res) => {
  created(res, await service.criarSubcategoria(req.body));
});

const atualizarSubcategoria = catchAsync(async (req, res) => {
  ok(res, await service.atualizarSubcategoria(req.params.id, req.body));
});

module.exports = {
  listarCategorias,
  categoriaPorSlug,
  criarCategoria,
  atualizarCategoria,
  criarSubcategoria,
  atualizarSubcategoria,
};
