"use strict";

const service = require("./me.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, paginated } = require("../../utils/http-response");

const paginar = (fn) =>
  catchAsync(async (req, res) => {
    const r = await fn(req.user.id, req.query);
    paginated(res, r, { page: r.page, perPage: r.perPage });
  });

module.exports = {
  resumo: catchAsync(async (req, res) => ok(res, await service.resumo(req.user.id))),
  pedidos: paginar(service.meusPedidos),
  ativos: paginar(service.meusAtivos),
  envios: paginar(service.meusEnvios),
  cotacoes: paginar(service.minhasCotacoes),
  repasses: paginar(service.meusRepasses),
};
