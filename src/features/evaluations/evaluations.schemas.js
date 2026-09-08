"use strict";

const { z } = require("zod");
const { CONDICOES, MODELOS_COMERCIAIS, MODALIDADES } = require("../../config/constants");

const preco = z.coerce.number().nonnegative().optional();

const avaliarSchema = z
  .object({
    approved: z.boolean(),
    decisionReason: z.string().max(2000).optional(),

    conditionNotes: z.string().max(2000).optional(),
    quantityNotes: z.string().max(2000).optional(),
    provenanceNotes: z.string().max(2000).optional(),
    logisticsNotes: z.string().max(2000).optional(),
    commercialNotes: z.string().max(2000).optional(),

    recommendedPrice: preco,
    recommendedMarketPrice: preco,
    recommendedModel: z.nativeEnum(MODELOS_COMERCIAIS).optional(),

    // Usados so quando aprovado, para nascer o ativo.
    name: z.string().max(220).optional(),
    shortDescription: z.string().max(2000).optional(),
    description: z.string().optional(),
    categoryId: z.string().uuid().optional(),
    subcategoryId: z.string().uuid().optional(),
    condition: z.enum(CONDICOES).optional(),
    location: z.string().max(140).optional(),
    quantity: z.coerce.number().int().min(0).optional(),
    unit: z.string().max(30).optional(),
    saleMode: z.nativeEnum(MODALIDADES).optional(),
  })
  .refine((d) => !d.approved || Boolean(d.categoryId), {
    message: "Aprovar exige categoryId para criar o ativo.",
    path: ["categoryId"],
  })
  .refine((d) => d.approved || Boolean(d.decisionReason), {
    message: "Recusar exige decisionReason.",
    path: ["decisionReason"],
  });

module.exports = { avaliarSchema };
