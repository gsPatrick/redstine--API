"use strict";

const { z } = require("zod");

const categoriaSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().max(120).optional(),
  description: z.string().optional(),
  position: z.coerce.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

const subcategoriaSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(2).max(140),
  slug: z.string().max(140).optional(),
  position: z.coerce.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });
const slugParamSchema = z.object({ slug: z.string().min(1).max(140) });

module.exports = {
  categoriaSchema,
  categoriaUpdateSchema: categoriaSchema.partial(),
  subcategoriaSchema,
  subcategoriaUpdateSchema: subcategoriaSchema.partial(),
  idParamSchema,
  slugParamSchema,
};
