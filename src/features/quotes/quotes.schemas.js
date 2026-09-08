"use strict";

const { z } = require("zod");
const { QUOTE_STATUS } = require("../../config/constants");

const criarSchema = z.object({
  assetId: z.string().uuid(),
  buyerName: z.string().min(2).max(160),
  buyerEmail: z.string().email(),
  buyerPhone: z.string().max(40).optional(),
  company: z.string().max(160).optional(),
  quantity: z.coerce.number().int().min(1).optional(),
  message: z.string().max(2000).optional(),
  buyerId: z.string().uuid().optional(),
});

const responderSchema = z.object({
  quotedPrice: z.coerce.number().nonnegative().optional(),
  responseNotes: z.string().max(2000).optional(),
});

const statusSchema = z.object({
  status: z.nativeEnum(QUOTE_STATUS),
  motivo: z.string().max(500).optional(),
});

// O atendimento tem dono: a secao 10 pede responsavel pela consulta.
const atribuirSchema = z.object({ assignedTo: z.string().uuid() });

const listarQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
  status: z.nativeEnum(QUOTE_STATUS).optional(),
  assignedTo: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  buyerId: z.string().uuid().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

module.exports = {
  atribuirSchema, criarSchema, responderSchema, statusSchema, listarQuerySchema, idParamSchema };
