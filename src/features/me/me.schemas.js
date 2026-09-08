"use strict";

const { z } = require("zod");
const {
  ASSET_STATUS,
  ORDER_STATUS,
  SUBMISSION_STATUS,
  QUOTE_STATUS,
  PAYOUT_STATUS,
} = require("../../config/constants");

const paginacao = {
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
};

module.exports = {
  pedidosQuerySchema: z.object({ ...paginacao, status: z.nativeEnum(ORDER_STATUS).optional() }),
  ativosQuerySchema: z.object({ ...paginacao, status: z.nativeEnum(ASSET_STATUS).optional() }),
  enviosQuerySchema: z.object({ ...paginacao, status: z.nativeEnum(SUBMISSION_STATUS).optional() }),
  cotacoesQuerySchema: z.object({ ...paginacao, status: z.nativeEnum(QUOTE_STATUS).optional() }),
  repassesQuerySchema: z.object({ ...paginacao, status: z.nativeEnum(PAYOUT_STATUS).optional() }),
};
