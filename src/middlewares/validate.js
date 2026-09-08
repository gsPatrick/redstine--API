"use strict";

const { AppError } = require("../utils/app-error");

/**
 * Validacao com Zod. Recebe { body, query, params } e substitui o valor pelo
 * resultado parseado — o controller passa a receber dados ja normalizados.
 */
const validate = (schemas) => (req, res, next) => {
  try {
    for (const alvo of ["body", "query", "params"]) {
      if (!schemas[alvo]) continue;
      const resultado = schemas[alvo].safeParse(req[alvo]);
      if (!resultado.success) {
        const details = resultado.error.issues.map((i) => ({
          campo: i.path.join("."),
          motivo: i.message,
        }));
        throw AppError.unprocessable("Dados invalidos.", "VALIDATION_ERROR", details);
      }
      // req.query e getter-only no Express 5; aqui (v4) a atribuicao e segura.
      req[alvo] = resultado.data;
    }
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { validate };
