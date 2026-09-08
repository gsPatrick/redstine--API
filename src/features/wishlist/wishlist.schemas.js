"use strict";

const { z } = require("zod");

const assetParamSchema = z.object({ assetId: z.string().uuid() });
const adicionarSchema = z.object({ assetId: z.string().uuid() });
const sincronizarSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(200),
});

module.exports = { assetParamSchema, adicionarSchema, sincronizarSchema };
