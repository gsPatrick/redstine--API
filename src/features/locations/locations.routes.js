"use strict";

const { Router } = require("express");
const controller = require("./locations.controller");
const schemas = require("./locations.schemas");
const { validate } = require("../../middlewares/validate");
const { requireAuth, requireRole } = require("../../middlewares/auth");
const { ROLES } = require("../../config/constants");

const router = Router();
const admin = [requireAuth, requireRole(ROLES.ADMIN)];

/**
 * A leitura é PÚBLICA, como a de categorias: o filtro de localização da página
 * Comprar e o formulário de cadastro precisam da lista, e a lista de cidades
 * onde a RED opera não é informação reservada.
 *
 * A escrita é de admin. Quem adiciona a terceira cidade é a RED, aqui — sem
 * migração e sem deploy. Note que não há DELETE: uma localização com ativos
 * não pode desaparecer, desativa-se (`active: false`).
 */
router.get("/", validate({ query: schemas.listarQuerySchema }), controller.listar);
router.post("/", admin, validate({ body: schemas.localizacaoSchema }), controller.criar);
router.patch(
  "/:id",
  admin,
  validate({ params: schemas.idParamSchema, body: schemas.localizacaoUpdateSchema }),
  controller.atualizar
);

module.exports = router;
