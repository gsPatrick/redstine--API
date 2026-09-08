"use strict";

/** Evita try/catch repetido em todo controller — erro vai para o handler global. */
const catchAsync = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { catchAsync };
