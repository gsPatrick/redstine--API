"use strict";

const service = require("./submissions.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, created, paginated } = require("../../utils/http-response");

const criar = catchAsync(async (req, res) => {
  const submission = await service.criar(req.body, { atorId: req.user?.id });
  // O publico recebe so a referencia: e o que ele precisa para acompanhar.
  created(res, { reference: submission.reference, status: submission.status });
});

const listar = catchAsync(async (req, res) => {
  const r = await service.listar(req.query);
  paginated(res, r, { page: r.page, perPage: r.perPage });
});

const detalhe = catchAsync(async (req, res) => {
  ok(res, await service.porId(req.params.id));
});

const atualizar = catchAsync(async (req, res) =>
  ok(res, await service.atualizar(req.params.id, req.body, { atorId: req.user?.id }))
);

const iniciarAvaliacao = catchAsync(async (req, res) => {
  ok(res, await service.iniciarAvaliacao(req.params.id));
});

module.exports = { criar, listar, detalhe, atualizar, iniciarAvaliacao };
