"use strict";

const { Router } = require("express");
const controller = require("./uploads.controller");
const schemas = require("./uploads.schemas");
const { validate } = require("../../middlewares/validate");
const { requireAuth, requireRole } = require("../../middlewares/auth");
const { imagens } = require("../../middlewares/upload");
const { ROLES } = require("../../config/constants");

const router = Router();

// Upload e operacao de curadoria — nao e publico.
router.use(requireAuth, requireRole(ROLES.ADMIN, ROLES.CURADOR));

router.post("/images", imagens("files"), controller.guardar);

router.post(
  "/assets/:assetId/images",
  validate({ params: schemas.assetParamSchema }),
  imagens("files"),
  controller.anexarAoAtivo
);

router.patch(
  "/assets/:assetId/images/order",
  validate({ params: schemas.assetParamSchema, body: schemas.reordenarSchema }),
  controller.reordenar
);

router.delete(
  "/images/:imageId",
  validate({ params: schemas.imageParamSchema }),
  controller.remover
);

module.exports = router;
