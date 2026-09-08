"use strict";

const { Router } = require("express");
const { z } = require("zod");
const controller = require("./payments.controller");
const { validate } = require("../../middlewares/validate");
const { optionalAuth } = require("../../middlewares/auth");

const router = Router();

const orderParam = z.object({ orderId: z.string().uuid() });

router.get("/methods", controller.metodos);

/**
 * O webhook fica fora da autenticacao por token — quem autentica e a
 * assinatura do PSP, verificada dentro do provider. Nao ha rate limit
 * restritivo aqui de proposito: bloquear o PSP faz o evento se perder.
 */
router.post("/webhook", controller.webhook);

// Checkout aceita convidado: a compra existe antes do cadastro.
router.post(
  "/orders/:orderId/checkout",
  optionalAuth,
  validate({
    params: orderParam,
    body: z.object({
      metodo: z.enum(["pix", "boleto", "cartao"]),
      pagador: z
        .object({
          name: z.string().min(2).optional(),
          document: z.string().min(11).max(18).optional(),
          email: z.string().email().optional(),
        })
        .optional(),
    }),
  }),
  controller.iniciar
);

router.get(
  "/orders/:orderId/status",
  optionalAuth,
  validate({ params: orderParam }),
  controller.status
);

module.exports = router;
