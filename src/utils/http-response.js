"use strict";

/** Formato unico de resposta. Toda rota devolve { data, meta? } ou { error }. */
const ok = (res, data, meta) =>
  res.status(200).json(meta ? { data, meta } : { data });

const created = (res, data) => res.status(201).json({ data });

const noContent = (res) => res.status(204).send();

/** Monta o meta de paginacao a partir do resultado de findAndCountAll. */
const paginated = (res, { rows, count }, { page, perPage }) =>
  res.status(200).json({
    data: rows,
    meta: {
      page,
      perPage,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / perPage)),
    },
  });

module.exports = { ok, created, noContent, paginated };
