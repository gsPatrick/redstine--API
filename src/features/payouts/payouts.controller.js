"use strict";

const service = require("./payouts.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, paginated } = require("../../utils/http-response");

const listar = catchAsync(async (req, res) => {
  const r = await service.listar(req.query);
  paginated(res, r, { page: r.page, perPage: r.perPage });
});

const resumoFornecedor = catchAsync(async (req, res) =>
  ok(res, await service.resumoDoFornecedor(req.params.supplierId))
);

const resumoPlataforma = catchAsync(async (req, res) =>
  ok(res, await service.resumoDaPlataforma({ desde: req.query.desde }))
);

const programar = catchAsync(async (req, res) =>
  ok(res, await service.programarPagamento(req.body.ids, { scheduledAt: req.body.scheduledAt }))
);

const marcarPagos = catchAsync(async (req, res) =>
  ok(
    res,
    await service.marcarPagos(req.body.ids, {
      notes: req.body.notes,
      paymentReference: req.body.paymentReference,
      paymentMethod: req.body.paymentMethod,
    })
  )
);

module.exports = { listar, resumoFornecedor, resumoPlataforma, programar, marcarPagos };
