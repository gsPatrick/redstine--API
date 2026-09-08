"use strict";

const { Router } = require("express");
const controller = require("./assets.controller");
const schemas = require("./assets.schemas");
const { validate } = require("../../middlewares/validate");
const { requireAuth, requireRole } = require("../../middlewares/auth");
const { ROLES } = require("../../config/constants");

const router = Router();

// ---- publico ----
router.get("/", validate({ query: schemas.listarQuerySchema }), controller.listarPublico);
router.get("/featured", controller.destaques);
router.get("/slug/:slug", validate({ params: schemas.slugParamSchema }), controller.detalhePublico);

// ---- interno ----
const interno = [requireAuth, requireRole(ROLES.ADMIN, ROLES.CURADOR)];

router.get("/admin", interno, validate({ query: schemas.listarQuerySchema }), controller.listarAdmin);
router.get("/admin/:id", interno, validate({ params: schemas.idParamSchema }), controller.detalheAdmin);
router.post("/", interno, validate({ body: schemas.criarSchema }), controller.criar);
router.patch(
  "/:id",
  interno,
  validate({ params: schemas.idParamSchema, body: schemas.atualizarSchema }),
  controller.atualizar
);
router.patch(
  "/:id/status",
  interno,
  validate({ params: schemas.idParamSchema, body: schemas.statusSchema }),
  controller.mudarStatus
);
router.delete("/:id", interno, validate({ params: schemas.idParamSchema }), controller.remover);

// Aprovacao e do fornecedor — nao exige papel interno.
router.post(
  "/:id/supplier-approval",
  requireAuth,
  validate({ params: schemas.idParamSchema }),
  controller.aprovar
);

module.exports = router;
