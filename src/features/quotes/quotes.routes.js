"use strict";

const { Router } = require("express");
const controller = require("./quotes.controller");
const schemas = require("./quotes.schemas");
const { validate } = require("../../middlewares/validate");
const { requireAuth, optionalAuth } = require("../../middlewares/auth");
const { requireCapability } = require("../../middlewares/capability");
const { CAPABILITIES } = require("../../config/constants");

const router = Router();

// Capacidade, nao papel: o time comercial atende consultas tanto quanto a
// curadoria, e amarrar a rota a uma lista de papeis obriga a editar codigo
// toda vez que o organograma muda.
const interno = [requireAuth, requireCapability(CAPABILITIES.COMMERCIAL_READ)];
const escrita = [requireAuth, requireCapability(CAPABILITIES.COMMERCIAL_WRITE)];

router.post("/", optionalAuth, validate({ body: schemas.criarSchema }), controller.criar);

router.get("/", interno, validate({ query: schemas.listarQuerySchema }), controller.listar);
router.get("/:id", interno, validate({ params: schemas.idParamSchema }), controller.detalhe);
router.post(
  "/:id/respond",
  escrita,
  validate({ params: schemas.idParamSchema, body: schemas.responderSchema }),
  controller.responder
);
router.post(
  "/:id/assign",
  escrita,
  validate({ params: schemas.idParamSchema, body: schemas.atribuirSchema }),
  controller.atribuir
);
router.patch(
  "/:id/status",
  escrita,
  validate({ params: schemas.idParamSchema, body: schemas.statusSchema }),
  controller.mudarStatus
);

module.exports = router;
