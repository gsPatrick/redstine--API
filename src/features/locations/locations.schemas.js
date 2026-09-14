"use strict";

const { z } = require("zod");

/**
 * O `name` é opcional na criação: se ficar vazio, sai "Cidade - UF", que é a
 * forma canónica decidida ("Rio de Janeiro - RJ"). Deixar o rótulo à mão livre
 * de quem cadastra é como nascem duas grafias para o mesmo lugar.
 */
const localizacaoSchema = z.object({
  city: z.string().min(2).max(120),
  uf: z.string().length(2).transform((v) => v.toUpperCase()),
  name: z.string().min(2).max(140).optional(),
  slug: z.string().max(120).optional(),
  position: z.coerce.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

module.exports = {
  localizacaoSchema,
  localizacaoUpdateSchema: localizacaoSchema.partial(),
  idParamSchema: z.object({ id: z.string().uuid() }),
  listarQuerySchema: z.object({
    // Só a gestão pede as inativas — o catálogo e o formulário querem a lista
    // vigente, não o histórico.
    incluirInativas: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  }),
};
