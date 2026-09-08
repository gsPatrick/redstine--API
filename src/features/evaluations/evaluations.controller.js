"use strict";

const service = require("./evaluations.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, created } = require("../../utils/http-response");

const avaliar = catchAsync(async (req, res) => {
  created(res, await service.avaliar(req.params.id, req.body, { curatorId: req.user.id }));
});

const listarPorEnvio = catchAsync(async (req, res) => {
  ok(res, await service.listarPorEnvio(req.params.id));
});

module.exports = { avaliar, listarPorEnvio };
