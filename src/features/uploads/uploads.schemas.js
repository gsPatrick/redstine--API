"use strict";

const { z } = require("zod");

module.exports = {
  assetParamSchema: z.object({ assetId: z.string().uuid() }),
  imageParamSchema: z.object({ imageId: z.string().uuid() }),
  reordenarSchema: z.object({
    imageIds: z.array(z.string().uuid()).min(1).max(50),
  }),
};
