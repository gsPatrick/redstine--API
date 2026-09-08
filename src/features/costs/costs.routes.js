"use strict";

const { Router } = require("express");
const controller = require("./costs.controller");
const schemas = require("./costs.schemas");
const { validate } = require("../../middlewares/validate");
const { requireAuth } = require("../../middlewares/auth");
const { requireCapability } = require("../../middlewares/capability");
const { CAPABILITIES } = require("../../config/constants");

const router = Router({ mergeParams: true });

// Custo altera o valor devido ao fornecedor: e operacao financeira.
router.use(requireAuth, requireCapability(CAPABILITIES.FINANCIAL_WRITE));

router.get("/", validate({ params: schemas.orderParamSchema }), controller.listar);
router.post(
  "/",
  validate({ params: schemas.orderParamSchema, body: schemas.criarSchema }),
  controller.criar
);
router.delete("/:costId", validate({ params: schemas.costParamSchema }), controller.remover);

module.exports = router;
