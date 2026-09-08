"use strict";

const { z } = require("zod");
const { TIPOS_CUSTO } = require("../../config/constants");

const criarSchema = z.object({
  type: z.enum(TIPOS_CUSTO),
  description: z.string().min(3).max(300),
  amount: z.coerce.number().positive("O custo precisa ser maior que zero."),
  // Sem item, o custo e do pedido inteiro e sera rateado entre os itens.
  orderItemId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});

module.exports = {
  criarSchema,
  orderParamSchema: z.object({ orderId: z.string().uuid() }),
  costParamSchema: z.object({
    orderId: z.string().uuid(),
    costId: z.string().uuid(),
  }),
};
