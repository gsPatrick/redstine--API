"use strict";

const { AppError } = require("../utils/app-error");
const { env } = require("../config/env");

/** Rota inexistente vira AppError para cair no mesmo formato de erro. */
function notFoundHandler(req, res, next) {
  next(AppError.notFound(`Rota nao encontrada: ${req.method} ${req.originalUrl}`, "ROUTE_NOT_FOUND"));
}

/** Traduz erros do Sequelize para o contrato publico da API. */
function traduzirSequelize(err) {
  if (err.name === "SequelizeUniqueConstraintError") {
    const campos = (err.errors || []).map((e) => e.path);
    return AppError.conflict("Registro ja existe.", "UNIQUE_VIOLATION", { campos });
  }
  if (err.name === "SequelizeValidationError") {
    const detalhes = (err.errors || []).map((e) => ({ campo: e.path, motivo: e.message }));
    return AppError.unprocessable("Dados invalidos.", "VALIDATION_ERROR", detalhes);
  }
  if (err.name === "SequelizeForeignKeyConstraintError") {
    return AppError.badRequest("Referencia invalida.", "FK_VIOLATION");
  }
  if (err.name === "SequelizeDatabaseError") {
    return new AppError("Erro ao consultar o banco.", 500, "DB_ERROR");
  }
  return null;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let erro = err;

  if (!(erro instanceof AppError)) {
    erro = traduzirSequelize(err) || erro;
  }

  if (err.name === "JsonWebTokenError") {
    erro = AppError.unauthorized("Token invalido.", "INVALID_TOKEN");
  }
  if (err.name === "TokenExpiredError") {
    erro = AppError.unauthorized("Token expirado.", "TOKEN_EXPIRED");
  }

  const statusCode = erro.statusCode || 500;
  const code = erro.code || "INTERNAL_ERROR";
  const message =
    statusCode === 500 && env.isProduction
      ? "Erro interno. Tente novamente."
      : erro.message;

  if (statusCode >= 500) {
    console.error(`[erro] ${req.method} ${req.originalUrl}`, err);
  }

  res.status(statusCode).json({
    error: {
      code,
      message,
      ...(erro.details ? { details: erro.details } : {}),
      ...(env.isProduction ? {} : { stack: err.stack }),
    },
  });
}

module.exports = { notFoundHandler, errorHandler };
