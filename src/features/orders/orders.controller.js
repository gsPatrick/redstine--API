"use strict";

const service = require("./orders.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, created, paginated } = require("../../utils/http-response");

const criar = catchAsync(async (req, res) => {
  const order = await service.criar(req.body, { atorId: req.user?.id });
  created(res, {
    id: order.id,
    reference: order.reference,
    status: order.status,
    total: order.total,
  });
});

/**
 * Venda fechada fora do site. Exige operador autenticado — ao contrario do
 * checkout, que e aberto: aqui alguem da RED esta a afirmar que uma venda
 * aconteceu, e essa afirmacao tem de ter autor.
 */
const registrarVendaExterna = catchAsync(async (req, res) => {
  const order = await service.registrarVendaExterna(req.body, {
    atorId: req.user.id,
    ator: { id: req.user.id, role: req.user.role },
  });
  created(res, order);
});

const confirmar = catchAsync(async (req, res) => {
  ok(res, await service.confirmar(req.params.id));
});

const mudarStatus = catchAsync(async (req, res) => {
  ok(res, await service.mudarStatus(req.params.id, req.body.status, { motivo: req.body.motivo }));
});

const listar = catchAsync(async (req, res) => {
  const r = await service.listar(req.query);
  paginated(res, r, { page: r.page, perPage: r.perPage });
});

const detalhe = catchAsync(async (req, res) => {
  ok(res, await service.porId(req.params.id));
});

const porReferencia = catchAsync(async (req, res) => {
  ok(res, await service.porReferencia(req.params.reference));
});

const ator = (req) => ({ id: req.user.id, role: req.user.role });

const registrarPagamento = catchAsync(async (req, res) =>
  ok(res, await service.registrarPagamento(req.params.id, { ...req.body, ator: ator(req) }))
);

const registrarRetirada = catchAsync(async (req, res) =>
  ok(res, await service.registrarRetirada(req.params.id, { ...req.body, ator: ator(req) }))
);

const pendencias = catchAsync(async (req, res) =>
  ok(res, await service.pendenciasDaConclusao(req.params.id))
);

const concluir = catchAsync(async (req, res) =>
  ok(res, await service.concluirOperacao(req.params.id, { ator: ator(req) }))
);

module.exports = {
  criar,
  registrarVendaExterna,
  confirmar,
  mudarStatus,
  listar,
  detalhe,
  porReferencia,
  registrarPagamento,
  registrarRetirada,
  pendencias,
  concluir,
};
