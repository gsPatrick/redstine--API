"use strict";

const { z } = require("zod");
const { ROLES, USER_STATUS } = require("../../config/constants");

const criarSchema = z.object({
  name: z.string().min(2).max(160),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  role: z.nativeEnum(ROLES),
  status: z.nativeEnum(USER_STATUS).optional(),
  phone: z.string().max(40).optional(),
  company: z.string().max(160).optional(),
  document: z.string().max(32).optional(),
  city: z.string().max(120).optional(),
  state: z.string().length(2).optional(),
});

const listarQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
  role: z.nativeEnum(ROLES).optional(),
  status: z.nativeEnum(USER_STATUS).optional(),
  search: z.string().max(160).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

module.exports = {
  criarSchema,
  atualizarSchema: criarSchema.partial(),
  listarQuerySchema,
  idParamSchema,
};
