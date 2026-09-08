"use strict";

const jwt = require("jsonwebtoken");
const { env } = require("../config/env");
const { AppError } = require("../utils/app-error");
const { catchAsync } = require("../utils/catch-async");
const db = require("../models");
const { USER_STATUS } = require("../config/constants");

function lerToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

/** Exige autenticacao. Carrega o utilizador em req.user. */
const requireAuth = catchAsync(async (req, res, next) => {
  const token = lerToken(req);
  if (!token) throw AppError.unauthorized("Token ausente.", "TOKEN_MISSING");

  const payload = jwt.verify(token, env.jwt.secret);
  const user = await db.User.findByPk(payload.sub);

  if (!user) throw AppError.unauthorized("Utilizador nao existe.", "USER_NOT_FOUND");
  if (user.status !== USER_STATUS.ATIVO) {
    throw AppError.forbidden("Conta inativa.", "USER_INACTIVE");
  }

  req.user = user;
  next();
});

/** Autentica se houver token, mas nao bloqueia — para rotas publicas com extras. */
const optionalAuth = catchAsync(async (req, res, next) => {
  const token = lerToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.jwt.secret);
    const user = await db.User.findByPk(payload.sub);
    if (user && user.status === USER_STATUS.ATIVO) req.user = user;
  } catch {
    // Token invalido em rota publica e ignorado de proposito.
  }
  next();
});

/** Restringe por papel. Usar sempre depois de requireAuth. */
const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(AppError.forbidden("Papel sem permissao para esta operacao."));
    }
    next();
  };

module.exports = { requireAuth, optionalAuth, requireRole };
