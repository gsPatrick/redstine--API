"use strict";

const service = require("./wishlist.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, created, noContent } = require("../../utils/http-response");

const listar = catchAsync(async (req, res) => ok(res, await service.listar(req.user.id)));

const adicionar = catchAsync(async (req, res) =>
  created(res, await service.adicionar(req.user.id, req.body.assetId))
);

const alternar = catchAsync(async (req, res) =>
  ok(res, await service.alternar(req.user.id, req.params.assetId))
);

const remover = catchAsync(async (req, res) => {
  await service.remover(req.user.id, req.params.assetId);
  noContent(res);
});

const sincronizar = catchAsync(async (req, res) =>
  ok(res, await service.sincronizar(req.user.id, req.body.assetIds))
);

module.exports = { listar, adicionar, alternar, remover, sincronizar };
