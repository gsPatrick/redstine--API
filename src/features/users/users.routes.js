"use strict";

const { Router } = require("express");
const controller = require("./users.controller");
const schemas = require("./users.schemas");
const { validate } = require("../../middlewares/validate");
const { requireAuth } = require("../../middlewares/auth");
const { requireCapability } = require("../../middlewares/capability");
const { CAPABILITIES } = require("../../config/constants");

const router = Router();

// Capacidade, nao papel — mesma regra do resto do painel. Hoje so o admin tem
// `admin_*`, mas quando existir um perfil de operacao com acesso parcial, a
// rota nao precisa mudar.
router.use(requireAuth, requireCapability(CAPABILITIES.ADMIN_READ));

router.get("/", validate({ query: schemas.listarQuerySchema }), controller.listar);
router.post("/", requireCapability(CAPABILITIES.ADMIN_WRITE), validate({ body: schemas.criarSchema }), controller.criar);
router.get("/:id", validate({ params: schemas.idParamSchema }), controller.detalhe);
router.patch(
  "/:id",
  requireCapability(CAPABILITIES.ADMIN_WRITE),
  validate({ params: schemas.idParamSchema, body: schemas.atualizarSchema }),
  controller.atualizar
);
router.delete("/:id", requireCapability(CAPABILITIES.ADMIN_WRITE), validate({ params: schemas.idParamSchema }), controller.remover);

module.exports = router;
