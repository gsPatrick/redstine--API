"use strict";

const { Router } = require("express");
const controller = require("./orders.controller");
const schemas = require("./orders.schemas");
const { validate } = require("../../middlewares/validate");
const { requireAuth, optionalAuth, requireRole } = require("../../middlewares/auth");
const costsRoutes = require("../costs/costs.routes");
const { ROLES } = require("../../config/constants");

const router = Router();
const interno = [requireAuth, requireRole(ROLES.ADMIN, ROLES.CURADOR, ROLES.COMERCIAL, ROLES.FINANCEIRO)];

// Checkout aberto: comprar nao exige conta.
router.post("/", optionalAuth, validate({ body: schemas.criarSchema }), controller.criar);

// Acompanhamento pela referencia impressa no comprovante.
router.get(
  "/reference/:reference",
  validate({ params: schemas.refParamSchema }),
  controller.porReferencia
);

/**
 * Registro de venda fechada fora do site (revisao do cliente, item 11).
 *
 * Rota interna, nao publica: quem registra e a RED. Vem ANTES de `/:id` de
 * proposito — declarada depois, o Express casaria "external" como um id e a
 * validacao devolveria "uuid invalido" em vez de registrar a venda.
 */
router.post(
  "/external",
  interno,
  validate({ body: schemas.vendaExternaSchema }),
  controller.registrarVendaExterna
);

router.get("/", interno, validate({ query: schemas.listarQuerySchema }), controller.listar);
router.get("/:id", interno, validate({ params: schemas.idParamSchema }), controller.detalhe);
router.post("/:id/confirm", interno, validate({ params: schemas.idParamSchema }), controller.confirmar);
router.patch(
  "/:id/status",
  interno,
  validate({ params: schemas.idParamSchema, body: schemas.statusSchema }),
  controller.mudarStatus
);

// Etapas da conclusao integral (documento oficial, secao 15).
router.patch(
  "/:id/payment",
  interno,
  validate({ params: schemas.idParamSchema, body: schemas.pagamentoSchema }),
  controller.registrarPagamento
);
router.patch(
  "/:id/pickup",
  interno,
  validate({ params: schemas.idParamSchema, body: schemas.retiradaSchema }),
  controller.registrarRetirada
);
router.get(
  "/:id/completion",
  interno,
  validate({ params: schemas.idParamSchema }),
  controller.pendencias
);
router.post(
  "/:id/complete",
  interno,
  validate({ params: schemas.idParamSchema }),
  controller.concluir
);

// Custos dedutiveis vivem sob o pedido — e la que eles fazem sentido.
router.use("/:orderId/costs", costsRoutes);

module.exports = router;
