"use strict";

const service = require("./notifications.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, paginated } = require("../../utils/http-response");

const listar = catchAsync(async (req, res) => {
  const r = await service.listar(req.user.id, req.query);
  paginated(res, r, { page: r.page, perPage: r.perPage });
});

const contador = catchAsync(async (req, res) =>
  ok(res, await service.contarNaoLidas(req.user.id))
);

const marcarLida = catchAsync(async (req, res) =>
  ok(res, await service.marcarLida(req.user.id, req.params.id))
);

const marcarTodasLidas = catchAsync(async (req, res) =>
  ok(res, await service.marcarTodasLidas(req.user.id))
);

module.exports = { listar, contador, marcarLida, marcarTodasLidas };
