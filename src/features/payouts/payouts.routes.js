"use strict";

const { Router } = require("express");
const controller = require("./payouts.controller");
const schemas = require("./payouts.schemas");
const { validate } = require("../../middlewares/validate");
const { requireAuth } = require("../../middlewares/auth");
const { requireCapability } = require("../../middlewares/capability");
const { CAPABILITIES } = require("../../config/constants");

const router = Router();

// Dado financeiro exige capacidade financeira. Comercial nao ve receita RED
// nem repasses — e a checagem vive aqui, nao no menu do front.
router.use(requireAuth);

router.get(
  "/",
  requireCapability(CAPABILITIES.FINANCIAL_READ),
  validate({ query: schemas.listarQuerySchema }),
  controller.listar
);
router.get(
  "/summary",
  requireCapability(CAPABILITIES.FINANCIAL_READ),
  controller.resumoPlataforma
);
router.get(
  "/supplier/:supplierId/summary",
  requireCapability(CAPABILITIES.FINANCIAL_READ),
  validate({ params: schemas.supplierParamSchema }),
  controller.resumoFornecedor
);
router.post(
  "/schedule",
  requireCapability(CAPABILITIES.FINANCIAL_WRITE),
  validate({ body: schemas.programarSchema }),
  controller.programar
);
router.post(
  "/mark-paid",
  requireCapability(CAPABILITIES.FINANCIAL_WRITE),
  validate({ body: schemas.marcarPagosSchema }),
  controller.marcarPagos
);

module.exports = router;
