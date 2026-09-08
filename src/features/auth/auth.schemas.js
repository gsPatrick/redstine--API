"use strict";

const { z } = require("zod");
const { ROLES } = require("../../config/constants");

const senha = z.string().min(8, "Minimo de 8 caracteres.").max(200);

const registrarSchema = z.object({
  name: z.string().min(2).max(160),
  email: z.string().email(),
  password: senha,
  role: z.enum([ROLES.COMPRADOR, ROLES.FORNECEDOR]).optional(),
  phone: z.string().max(40).optional(),
  company: z.string().max(160).optional(),
  document: z.string().max(32).optional(),
  city: z.string().max(120).optional(),
  state: z.string().length(2).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const trocarSenhaSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: senha,
});

const pedirRecuperacaoSchema = z.object({ email: z.string().email() });

const redefinirSenhaSchema = z.object({
  token: z.string().min(32).max(128),
  newPassword: senha,
});

module.exports = {
  registrarSchema,
  loginSchema,
  trocarSenhaSchema,
  pedirRecuperacaoSchema,
  redefinirSenhaSchema,
};
