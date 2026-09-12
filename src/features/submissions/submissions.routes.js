"use strict";

const { Router } = require("express");
const controller = require("./submissions.controller");
const schemas = require("./submissions.schemas");
const evaluationsController = require("../evaluations/evaluations.controller");
const evaluationsSchemas = require("../evaluations/evaluations.schemas");
const { validate } = require("../../middlewares/validate");
const { requireAuth, optionalAuth, requireRole } = require("../../middlewares/auth");
const { ROLES } = require("../../config/constants");

const router = Router();
const interno = [requireAuth, requireRole(ROLES.ADMIN, ROLES.CURADOR)];

// Envio sem sessao. Desde a revisao do cliente (item 4) o site NAO usa mais
// esta porta: enviar ativo exige conta, e o formulario vive no painel. Fica
// como canal de intake — importacao, integracao, envio recebido por fora.
router.post("/", optionalAuth, validate({ body: schemas.criarSchema }), controller.criar);

router.get("/", interno, validate({ query: schemas.listarQuerySchema }), controller.listar);
router.get("/:id", interno, validate({ params: schemas.idParamSchema }), controller.detalhe);
router.patch(
  "/:id",
  interno,
  validate({ params: schemas.idParamSchema, body: schemas.atualizarSchema }),
  controller.atualizar
);
router.post(
  "/:id/start-review",
  interno,
  validate({ params: schemas.idParamSchema }),
  controller.iniciarAvaliacao
);

// A curadoria de um envio vive sob o proprio envio.
router.get(
  "/:id/evaluations",
  interno,
  validate({ params: schemas.idParamSchema }),
  evaluationsController.listarPorEnvio
);
router.post(
  "/:id/evaluations",
  interno,
  validate({ params: schemas.idParamSchema, body: evaluationsSchemas.avaliarSchema }),
  evaluationsController.avaliar
);

module.exports = router;
