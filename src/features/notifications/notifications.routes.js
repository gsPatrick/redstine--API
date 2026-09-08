"use strict";

const { Router } = require("express");
const { z } = require("zod");
const controller = require("./notifications.controller");
const { validate } = require("../../middlewares/validate");
const { requireAuth } = require("../../middlewares/auth");

const router = Router();

// O sino e do utilizador do token, em qualquer painel.
router.use(requireAuth);

router.get(
  "/",
  validate({
    query: z.object({
      page: z.coerce.number().int().min(1).optional(),
      perPage: z.coerce.number().int().min(1).max(100).optional(),
      apenasNaoLidas: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
    }),
  }),
  controller.listar
);
router.get("/unread-count", controller.contador);
router.post("/read-all", controller.marcarTodasLidas);
router.post(
  "/:id/read",
  validate({ params: z.object({ id: z.string().uuid() }) }),
  controller.marcarLida
);

module.exports = router;
