"use strict";

const service = require("./users.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, created, paginated, noContent } = require("../../utils/http-response");

const listar = catchAsync(async (req, res) => {
  const r = await service.listar(req.query);
  paginated(res, r, { page: r.page, perPage: r.perPage });
});

const detalhe = catchAsync(async (req, res) => ok(res, await service.porId(req.params.id)));
const criar = catchAsync(async (req, res) => created(res, await service.criar(req.body)));
const atualizar = catchAsync(async (req, res) =>
  ok(res, await service.atualizar(req.params.id, req.body))
);
const remover = catchAsync(async (req, res) => {
  await service.remover(req.params.id, { atorId: req.user.id });
  noContent(res);
});

module.exports = { listar, detalhe, criar, atualizar, remover };
