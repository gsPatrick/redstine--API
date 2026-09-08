"use strict";

const service = require("./auth.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, created } = require("../../utils/http-response");

const registrar = catchAsync(async (req, res) => {
  created(res, await service.registrar(req.body));
});

const login = catchAsync(async (req, res) => {
  ok(res, await service.autenticar(req.body));
});

const eu = catchAsync(async (req, res) => {
  ok(res, service.publico(req.user));
});

const trocarSenha = catchAsync(async (req, res) => {
  ok(res, await service.trocarSenha(req.user.id, req.body));
});

const pedirRecuperacao = catchAsync(async (req, res) => {
  ok(res, await service.pedirRecuperacao(req.body, { ip: req.ip }));
});

const redefinirSenha = catchAsync(async (req, res) => {
  ok(res, await service.redefinirSenha(req.body));
});

module.exports = { registrar, login, eu, trocarSenha, pedirRecuperacao, redefinirSenha };
