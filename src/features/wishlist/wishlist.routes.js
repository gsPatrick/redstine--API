"use strict";

const { Router } = require("express");
const controller = require("./wishlist.controller");
const schemas = require("./wishlist.schemas");
const { validate } = require("../../middlewares/validate");
const { requireAuth } = require("../../middlewares/auth");

const router = Router();

// Favoritos sao sempre do utilizador do token — nunca se passa userId por fora.
router.use(requireAuth);

router.get("/", controller.listar);
router.post("/", validate({ body: schemas.adicionarSchema }), controller.adicionar);
router.post("/sync", validate({ body: schemas.sincronizarSchema }), controller.sincronizar);
router.post(
  "/:assetId/toggle",
  validate({ params: schemas.assetParamSchema }),
  controller.alternar
);
router.delete("/:assetId", validate({ params: schemas.assetParamSchema }), controller.remover);

module.exports = router;
