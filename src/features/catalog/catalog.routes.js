"use strict";

const { Router } = require("express");
const controller = require("./catalog.controller");
const schemas = require("./catalog.schemas");
const { validate } = require("../../middlewares/validate");
const { requireAuth, requireRole } = require("../../middlewares/auth");
const { ROLES } = require("../../config/constants");

const router = Router();
const admin = [requireAuth, requireRole(ROLES.ADMIN)];

router.get("/categories", controller.listarCategorias);
router.get(
  "/categories/:slug",
  validate({ params: schemas.slugParamSchema }),
  controller.categoriaPorSlug
);

router.post("/categories", admin, validate({ body: schemas.categoriaSchema }), controller.criarCategoria);
router.patch(
  "/categories/:id",
  admin,
  validate({ params: schemas.idParamSchema, body: schemas.categoriaUpdateSchema }),
  controller.atualizarCategoria
);

router.post(
  "/subcategories",
  admin,
  validate({ body: schemas.subcategoriaSchema }),
  controller.criarSubcategoria
);
router.patch(
  "/subcategories/:id",
  admin,
  validate({ params: schemas.idParamSchema, body: schemas.subcategoriaUpdateSchema }),
  controller.atualizarSubcategoria
);

module.exports = router;
