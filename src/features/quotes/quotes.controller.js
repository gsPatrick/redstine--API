"use strict";

const service = require("./quotes.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, created, paginated } = require("../../utils/http-response");

const criar = catchAsync(async (req, res) => {
  const quote = await service.criar(req.body, { atorId: req.user?.id });
  created(res, { id: quote.id, reference: quote.reference, status: quote.status });
});

const responder = catchAsync(async (req, res) => {
  ok(res, await service.responder(req.params.id, req.body, {
    ator: { id: req.user.id, role: req.user.role },
  }));
});

const atribuir = catchAsync(async (req, res) =>
  ok(res, await service.atribuir(req.params.id, req.body.assignedTo))
);

const mudarStatus = catchAsync(async (req, res) => {
  ok(res, await service.mudarStatus(req.params.id, req.body.status, { motivo: req.body.motivo }));
});

const listar = catchAsync(async (req, res) => {
  const r = await service.listar(req.query);
  paginated(res, r, { page: r.page, perPage: r.perPage });
});

const detalhe = catchAsync(async (req, res) => {
  ok(res, await service.porId(req.params.id));
});

module.exports = {
  atribuir, criar, responder, mudarStatus, listar, detalhe };
