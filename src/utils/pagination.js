"use strict";

const MAX_PER_PAGE = 100;

/** Le page/perPage da query com limites, para nao existir consulta sem teto. */
function parsePagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const perPageRaw = Number.parseInt(query.perPage ?? query.per_page, 10) || 20;
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, perPageRaw));
  return { page, perPage, limit: perPage, offset: (page - 1) * perPage };
}

module.exports = { parsePagination, MAX_PER_PAGE };
