"use strict";

const { Router } = require("express");
const { z } = require("zod");
const controller = require("./audit.controller");
const { validate } = require("../../middlewares/validate");
const { requireAuth } = require("../../middlewares/auth");
const { requireAnyCapability } = require("../../middlewares/capability");
const { CAPABILITIES, ENTIDADES_AUDITAVEIS } = require("../../config/constants");

const router = Router();

// Historico e leitura de gestao — comercial ou financeiro, conforme o caso.
router.get(
  "/:entity/:entityId",
  requireAuth,
  requireAnyCapability(CAPABILITIES.COMMERCIAL_READ, CAPABILITIES.FINANCIAL_READ),
  validate({
    params: z.object({
      entity: z.enum(ENTIDADES_AUDITAVEIS),
      entityId: z.string().uuid(),
    }),
  }),
  controller.historico
);

module.exports = router;
