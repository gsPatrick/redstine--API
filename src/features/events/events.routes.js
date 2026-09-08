"use strict";

const { Router } = require("express");
const { z } = require("zod");
const controller = require("./events.controller");
const { validate } = require("../../middlewares/validate");
const { requireAuth, optionalAuth } = require("../../middlewares/auth");
const { requireCapability } = require("../../middlewares/capability");
const { CAPABILITIES } = require("../../config/constants");

const router = Router();

// Visualizacao vem de visitante anonimo tambem — e a maioria do trafego.
router.post(
  "/product-view",
  optionalAuth,
  validate({
    body: z.object({
      assetId: z.string().uuid(),
      payload: z.record(z.any()).optional(),
    }),
  }),
  controller.registrarVisualizacao
);

// Leitura e dado de gestao.
router.get(
  "/summary",
  requireAuth,
  requireCapability(CAPABILITIES.COMMERCIAL_READ),
  controller.resumo
);
router.get(
  "/assets/:assetId/funnel",
  requireAuth,
  requireCapability(CAPABILITIES.COMMERCIAL_READ),
  validate({ params: z.object({ assetId: z.string().uuid() }) }),
  controller.funil
);

module.exports = router;
