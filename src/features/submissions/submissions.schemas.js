"use strict";

const { z } = require("zod");
const { SUBMISSION_STATUS } = require("../../config/constants");

const criarSchema = z.object({
  name: z.string().min(2).max(160),
  company: z.string().max(160).optional(),
  email: z.string().email(),
  phone: z.string().min(8).max(40),
  city: z.string().max(160).optional(),
  assetType: z.string().max(120).optional(),
  description: z.string().min(10, "Descreva os ativos com pelo menos 10 caracteres."),
  approximateQuantity: z.string().max(80).optional(),
  notes: z.string().max(4000).optional(),
  photos: z.array(z.string().url()).max(20).optional(),
  authorized: z.literal(true, {
    errorMap: () => ({ message: "A autorizacao sobre os ativos e obrigatoria." }),
  }),
  supplierId: z.string().uuid().optional(),
});

/**
 * Edicao do envio pela curadoria.
 *
 * Nem tudo do criarSchema e editavel aqui: `authorized` e a declaracao do
 * fornecedor sobre ter direito de vender, e `supplierId` e a identidade de
 * quem enviou — reescrever qualquer um dos dois seria adulterar o registo, nao
 * corrigi-lo.
 *
 * O resto e corrigivel porque chega por formulario livre e frequentemente vem
 * com erro de digitacao, cidade sem UF ou quantidade no campo errado, e a
 * curadoria precisa arrumar isso antes de gerar o ativo.
 */
const atualizarSchema = z
  .object({
    name: z.string().min(2).max(160).optional(),
    company: z.string().max(160).nullish(),
    email: z.string().email().optional(),
    phone: z.string().min(8).max(40).optional(),
    city: z.string().max(160).nullish(),
    assetType: z.string().max(120).nullish(),
    description: z.string().min(3).max(4000).optional(),
    approximateQuantity: z.string().max(80).nullish(),
    notes: z.string().max(4000).nullish(),
    photos: z.array(z.string().url()).max(20).optional(),
    attributes: z.record(z.any()).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Nada para atualizar." });

const listarQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
  status: z.nativeEnum(SUBMISSION_STATUS).optional(),
  supplierId: z.string().uuid().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

module.exports = { criarSchema, atualizarSchema, listarQuerySchema, idParamSchema };
