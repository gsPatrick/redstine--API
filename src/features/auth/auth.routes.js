"use strict";

const { Router } = require("express");
const controller = require("./auth.controller");
const schemas = require("./auth.schemas");
const { validate } = require("../../middlewares/validate");
const { requireAuth } = require("../../middlewares/auth");
const { authLimiter } = require("../../middlewares/rate-limit");

const router = Router();

router.post("/register", authLimiter, validate({ body: schemas.registrarSchema }), controller.registrar);
router.post("/login", authLimiter, validate({ body: schemas.loginSchema }), controller.login);
router.get("/me", requireAuth, controller.eu);
router.patch("/password", requireAuth, validate({ body: schemas.trocarSenhaSchema }), controller.trocarSenha);

// Recuperacao usa o limitador apertado: e alvo de abuso para enumerar contas.
router.post(
  "/forgot-password",
  authLimiter,
  validate({ body: schemas.pedirRecuperacaoSchema }),
  controller.pedirRecuperacao
);
router.post(
  "/reset-password",
  authLimiter,
  validate({ body: schemas.redefinirSenhaSchema }),
  controller.redefinirSenha
);

module.exports = router;
