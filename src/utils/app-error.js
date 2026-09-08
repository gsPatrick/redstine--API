"use strict";

/**
 * Erro de aplicacao com statusCode e `code` estavel — o cliente pode ramificar
 * pelo code sem depender da mensagem, que pode mudar.
 */
class AppError extends Error {
  constructor(message, statusCode = 400, code = "BAD_REQUEST", details = undefined) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg, code = "BAD_REQUEST", details) {
    return new AppError(msg, 400, code, details);
  }
  static unauthorized(msg = "Nao autenticado.", code = "UNAUTHORIZED") {
    return new AppError(msg, 401, code);
  }
  static forbidden(msg = "Sem permissao para esta operacao.", code = "FORBIDDEN") {
    return new AppError(msg, 403, code);
  }
  static notFound(msg = "Recurso nao encontrado.", code = "NOT_FOUND") {
    return new AppError(msg, 404, code);
  }
  static conflict(msg, code = "CONFLICT", details) {
    return new AppError(msg, 409, code, details);
  }
  static unprocessable(msg, code = "UNPROCESSABLE", details) {
    return new AppError(msg, 422, code, details);
  }
}

module.exports = { AppError };
