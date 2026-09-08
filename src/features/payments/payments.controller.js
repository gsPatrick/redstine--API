"use strict";

const service = require("./payments.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, created } = require("../../utils/http-response");

const metodos = catchAsync(async (req, res) => ok(res, service.metodosDisponiveis()));

const iniciar = catchAsync(async (req, res) =>
  created(res, await service.iniciar(req.params.orderId, req.body))
);

const status = catchAsync(async (req, res) => ok(res, await service.status(req.params.orderId)));

const webhook = catchAsync(async (req, res) => ok(res, await service.processarWebhook(req)));

module.exports = { metodos, iniciar, status, webhook };
