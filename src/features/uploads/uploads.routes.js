"use strict";

const { Router } = require("express");
const controller = require("./uploads.controller");
const schemas = require("./uploads.schemas");
const { validate } = require("../../middlewares/validate");
const { requireAuth, requireRole } = require("../../middlewares/auth");
const { imagens } = require("../../middlewares/upload");
const { ROLES } = require("../../config/constants");

const router = Router();

// Tudo aqui exige sessao. O que muda por rota e QUEM pode fazer o que.
router.use(requireAuth);

/**
 * Fotos de um ativo que o fornecedor esta enviando para avaliacao.
 *
 * Precisa ser acessivel a qualquer utilizador autenticado: quem envia um ativo
 * pelo painel e o fornecedor, nao a curadoria. As demais rotas deste ficheiro
 * continuam restritas porque mexem no catalogo — anexam, reordenam e apagam
 * imagens de ativos ja existentes. Esta nao toca em nenhum ativo: recebe os
 * ficheiros, guarda e devolve os URLs, que o formulario manda de volta em
 * `fotos`. Os limites de tipo e tamanho sao os mesmos.
 */
router.post("/submission-images", imagens("files", 8), controller.guardarDoEnvio);

// Dali para baixo e operacao de curadoria sobre o catalogo.
router.use(requireRole(ROLES.ADMIN, ROLES.CURADOR));

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
