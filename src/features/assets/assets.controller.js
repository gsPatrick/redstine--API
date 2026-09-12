"use strict";

const service = require("./assets.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, created, paginated, noContent } = require("../../utils/http-response");
const { ROLES } = require("../../config/constants");

const ehInterno = (user) =>
  user && (user.role === ROLES.ADMIN || user.role === ROLES.CURADOR);

/** Catalogo publico: sempre restrito a ativos publicados. */
const listarPublico = catchAsync(async (req, res) => {
  const r = await service.listar(req.query, { somentePublicados: true });
  // `filtros` viaja no meta, nao no data: e informacao sobre a lista (que
  // opcoes ainda tem acervo), nao um item dela.
  paginated(res, r, { page: r.page, perPage: r.perPage, filtros: r.filtros });
});

const destaques = catchAsync(async (req, res) => {
  const limit = Number.parseInt(req.query.limit, 10) || 9;
  ok(res, await service.destaques({ limit: Math.min(30, Math.max(1, limit)) }));
});

const detalhePublico = catchAsync(async (req, res) => {
  ok(res, await service.porSlug(req.params.slug, { somentePublicados: true }));
});

/** Area interna: enxerga qualquer status. */
const listarAdmin = catchAsync(async (req, res) => {
  const r = await service.listar(req.query, { somentePublicados: false });
  paginated(res, r, { page: r.page, perPage: r.perPage });
});

const detalheAdmin = catchAsync(async (req, res) => {
  ok(res, await service.porId(req.params.id));
});

const criar = catchAsync(async (req, res) => {
  created(res, await service.criar(req.body, { atorId: req.user.id }));
});

const atualizar = catchAsync(async (req, res) => {
  ok(
    res,
    await service.atualizar(req.params.id, req.body, {
      ator: { id: req.user.id, role: req.user.role },
    })
  );
});

const mudarStatus = catchAsync(async (req, res) => {
  ok(
    res,
    await service.mudarStatus(req.params.id, req.body.status, {
      motivo: req.body.motivo,
      ator: { id: req.user.id, role: req.user.role },
    })
  );
});

const aprovar = catchAsync(async (req, res) => {
  ok(
    res,
    await service.aprovarPeloFornecedor(req.params.id, {
      atorId: req.user.id,
      role: req.user.role,
    })
  );
});

const remover = catchAsync(async (req, res) => {
  await service.remover(req.params.id);
  noContent(res);
});

module.exports = {
  listarPublico,
  destaques,
  detalhePublico,
  listarAdmin,
  detalheAdmin,
  criar,
  atualizar,
  mudarStatus,
  aprovar,
  remover,
  ehInterno,
};
