"use strict";

const { z } = require("zod");
const {
  CONDICOES,
  ASSET_STATUS,
  MODELOS_COMERCIAIS,
  MODALIDADES,
  FORMAS_DE_VENDA,
  DISPONIBILIDADE,
  CAMPOS_TECNICOS,
} = require("../../config/constants");

const numeroOpcional = z.coerce.number().nonnegative().optional();
const boolQuery = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

const listarQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().max(160).optional(),
  category: z.string().max(140).optional(),
  subcategory: z.string().max(140).optional(),
  condition: z.enum(CONDICOES).optional(),
  saleMode: z.nativeEnum(MODALIDADES).optional(),
  saleFormat: z.nativeEnum(FORMAS_DE_VENDA).optional(),
  availability: z.nativeEnum(DISPONIBILIDADE).optional(),
  commercialModel: z.nativeEnum(MODELOS_COMERCIAIS).optional(),
  location: z.string().max(140).optional(),
  brand: z.string().max(120).optional(),
  featured: boolQuery,
  minPrice: numeroOpcional,
  maxPrice: numeroOpcional,
  sort: z.enum(["recentes", "preco_asc", "preco_desc", "nome"]).optional(),
  status: z.nativeEnum(ASSET_STATUS).optional(),
  supplierId: z.string().uuid().optional(),
  // Filtros tecnicos: aparecem so quando a categoria os usa, entao sao todos
  // opcionais e nenhum e obrigatorio em conjunto.
  ...Object.fromEntries(CAMPOS_TECNICOS.map((c) => [c, z.string().max(80).optional()])),
});

const imagemSchema = z.object({
  url: z.string().url().max(500),
  alt: z.string().max(220).optional(),
  position: z.number().int().min(0).optional(),
});

const criarSchema = z.object({
  name: z.string().min(3).max(220),
  slug: z.string().max(200).optional(),
  sku: z.string().max(60).optional(),
  shortDescription: z.string().max(2000).optional(),
  description: z.string().optional(),
  categoryId: z.string().uuid(),
  subcategoryId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  condition: z.enum(CONDICOES).optional(),
  location: z.string().max(140).optional(),
  brand: z.string().max(120).optional(),
  material: z.string().max(120).optional(),
  color: z.string().max(80).optional(),
  size: z.string().max(80).optional(),
  quantity: z.coerce.number().int().min(0).optional(),
  // Quantidade de partida do lote. Aceita-se explicitamente porque a
  // curadoria por vezes cadastra um lote ja parcialmente consumido.
  originalQuantity: z.coerce.number().int().min(0).optional(),
  unit: z.string().max(30).optional(),
  price: numeroOpcional,
  marketPrice: numeroOpcional,
  saleMode: z.nativeEnum(MODALIDADES).optional(),
  saleFormat: z.nativeEnum(FORMAS_DE_VENDA).optional(),
  availability: z.nativeEnum(DISPONIBILIDADE).optional(),
  commercialModel: z.nativeEnum(MODELOS_COMERCIAIS).optional(),
  featured: z.boolean().optional(),
  attributes: z.record(z.any()).optional(),
  images: z.array(imagemSchema).max(20).optional(),
});

const atualizarSchema = criarSchema.partial().omit({ images: true });

const statusSchema = z.object({
  status: z.nativeEnum(ASSET_STATUS),
  motivo: z.string().max(500).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });
const slugParamSchema = z.object({ slug: z.string().min(1).max(200) });

module.exports = {
  listarQuerySchema,
  criarSchema,
  atualizarSchema,
  statusSchema,
  idParamSchema,
  slugParamSchema,
};
