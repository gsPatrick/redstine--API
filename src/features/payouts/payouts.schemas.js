"use strict";

const { z } = require("zod");
const { PAYOUT_STATUS } = require("../../config/constants");

const listarQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
  status: z.nativeEnum(PAYOUT_STATUS).optional(),
  supplierId: z.string().uuid().optional(),
  prazo: z.enum(["no_prazo", "vencendo", "vencido"]).optional(),
});

const marcarPagosSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  notes: z.string().max(500).optional(),
  // O historico do fornecedor mostra o meio ao lado do comprovante: sem ele a
  // coluna fica vazia e o repasse pago vira um registo sem rasto.
  paymentMethod: z.enum(["pix", "transferencia", "boleto", "outro"]).optional(),
  paymentReference: z.string().max(160).optional(),
});

const programarSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  scheduledAt: z.coerce.date().optional(),
});

const supplierParamSchema = z.object({ supplierId: z.string().uuid() });

module.exports = { listarQuerySchema, marcarPagosSchema, programarSchema, supplierParamSchema };
