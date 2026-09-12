"use strict";

/** Formato unico de resposta. Toda rota devolve { data, meta? } ou { error }. */
const ok = (res, data, meta) =>
  res.status(200).json(meta ? { data, meta } : { data });

const created = (res, data) => res.status(201).json({ data });

const noContent = (res) => res.status(204).send();

/**
 * Monta o meta de paginacao a partir do resultado de findAndCountAll.
 *
 * Qualquer chave extra passada no terceiro argumento entra no `meta` ao lado
 * da paginacao — e onde vivem os totais e o painel de filtros. Chave com
 * valor `undefined` nao aparece, para que a rota que nao tem o extra continue
 * a devolver o mesmo objeto de antes.
 */
const paginated = (res, { rows, count }, { page, perPage, ...extra }) =>
  res.status(200).json({
    data: rows,
    meta: {
      page,
      perPage,
      total: count,
      totalPages: Math.max(1, Math.ceil(count / perPage)),
      ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)),
    },
  });

module.exports = { ok, created, noContent, paginated };
