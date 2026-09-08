"use strict";

const service = require("./costs.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, created, noContent } = require("../../utils/http-response");

const criar = catchAsync(async (req, res) =>
  created(res, await service.criar(req.params.orderId, req.body, { atorId: req.user.id }))
);

const listar = catchAsync(async (req, res) => ok(res, await service.listar(req.params.orderId)));

const remover = catchAsync(async (req, res) => {
  await service.remover(req.params.orderId, req.params.costId);
  noContent(res);
});

module.exports = { criar, listar, remover };
