"use strict";

const service = require("./events.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, created } = require("../../utils/http-response");
const { EVENTOS } = require("../../config/constants");

/**
 * Unico evento que o front reporta explicitamente: a visualizacao de produto.
 * Os outros nove nascem no backend, no momento em que a acao acontece — assim
 * nao dependem de o cliente lembrar de avisar.
 */
const registrarVisualizacao = catchAsync(async (req, res) => {
  await service.registrar(EVENTOS.PRODUCT_VIEW, {
    ...service.doRequest(req),
    assetId: req.body.assetId,
    payload: req.body.payload || {},
  });
  created(res, { ok: true });
});

const resumo = catchAsync(async (req, res) =>
  ok(res, await service.contarPorTipo({ desde: req.query.desde, ate: req.query.ate }))
);

const funil = catchAsync(async (req, res) =>
  ok(res, await service.funilDoAtivo(req.params.assetId))
);

module.exports = { registrarVisualizacao, resumo, funil };
