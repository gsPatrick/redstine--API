"use strict";

const service = require("./locations.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, created } = require("../../utils/http-response");

const listar = catchAsync(async (req, res) => {
  ok(res, await service.listar({ incluirInativas: req.query.incluirInativas === true }));
});

const criar = catchAsync(async (req, res) => {
  created(res, await service.criar(req.body, { ator: req.user }));
});

const atualizar = catchAsync(async (req, res) => {
  ok(res, await service.atualizar(req.params.id, req.body, { ator: req.user }));
});

module.exports = { listar, criar, atualizar };
