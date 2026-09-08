"use strict";

const { z } = require("zod");
const {
  ORDER_STATUS,
  PAGAMENTOS,
  PAYMENT_STATUS,
  PICKUP_STATUS,
} = require("../../config/constants");

const criarSchema = z.object({
  buyerName: z.string().min(2).max(160),
  buyerEmail: z.string().email(),
  buyerPhone: z.string().max(40).optional(),
  buyerDocument: z.string().max(32).optional(),
  buyerId: z.string().uuid().optional(),
  billing: z.record(z.any()).optional(),
  paymentMethod: z.nativeEnum(PAGAMENTOS),
  notes: z.string().max(2000).optional(),
  items: z
    .array(
      z.object({
        assetId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1),
      })
    )
    .min(1, "O pedido precisa de pelo menos um item."),
});

const statusSchema = z.object({
  status: z.nativeEnum(ORDER_STATUS),
  motivo: z.string().max(500).optional(),
});

const listarQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
  status: z.nativeEnum(ORDER_STATUS).optional(),
  buyerId: z.string().uuid().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });
const refParamSchema = z.object({ reference: z.string().min(4).max(24) });

const pagamentoSchema = z.object({
  status: z.nativeEnum(PAYMENT_STATUS),
  reference: z.string().max(160).optional(),
});

/**
 * Retirada.
 *
 * Os campos estruturados existem porque o Detalhe da Compra os renderiza em
 * linhas separadas — "Local", "Endereço", "Responsável". Um bloco de texto
 * livre nao da para exibir assim, e obrigaria o front a tentar interpretar
 * prosa.
 */
const retiradaSchema = z.object({
  status: z.nativeEnum(PICKUP_STATUS),
  local: z.string().max(160).optional(),
  endereco: z.string().max(300).optional(),
  responsavel: z.string().max(140).optional(),
  contato: z.string().max(40).optional(),
  agendamento: z.coerce.date().optional(),
  instrucoes: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});

module.exports = {
  criarSchema,
  statusSchema,
  listarQuerySchema,
  idParamSchema,
  refParamSchema,
  pagamentoSchema,
  retiradaSchema,
};
