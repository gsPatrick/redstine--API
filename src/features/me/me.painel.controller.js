"use strict";

const painel = require("./me.painel");
const dashboard = require("./me.dashboard");
const conta = require("./me.conta");
const envio = require("./me.envio");
const { catchAsync } = require("../../utils/catch-async");
const { ok, created, paginated } = require("../../utils/http-response");

const ator = (req) => ({ id: req.user.id, role: req.user.role });
const lista = (res, r) => paginated(res, { rows: r.rows, count: r.count }, { page: r.page, perPage: r.perPage });

// ---- Visão Geral e Dashboard
const visaoGeral = catchAsync(async (req, res) => ok(res, await dashboard.visaoGeral(req.user.id)));
const painelDeVendas = catchAsync(async (req, res) =>
  ok(res, await dashboard.dashboard(req.user.id, req.query))
);
const atividades = catchAsync(async (req, res) =>
  ok(res, await dashboard.ultimasAtividades(req.user.id, Number(req.query.limit) || 5))
);

// ---- Comprar
const compras = catchAsync(async (req, res) => lista(res, await painel.compras(req.user.id, req.query)));
const compra = catchAsync(async (req, res) => ok(res, await painel.compra(req.user.id, req.params.id)));
const consultas = catchAsync(async (req, res) =>
  lista(res, await painel.consultas(req.user.id, req.query))
);
const consulta = catchAsync(async (req, res) =>
  ok(res, await painel.consulta(req.user.id, req.params.id))
);

// ---- Vender
const ativos = catchAsync(async (req, res) => lista(res, await painel.ativos(req.user.id, req.query)));
const ativo = catchAsync(async (req, res) => ok(res, await painel.ativo(req.user.id, req.params.id)));
const vendas = catchAsync(async (req, res) => lista(res, await painel.vendas(req.user.id, req.query)));
const pagamentos = catchAsync(async (req, res) =>
  lista(res, await painel.pagamentos(req.user.id, req.query))
);

const enviarAtivo = catchAsync(async (req, res) =>
  created(res, await envio.enviar(req.user.id, req.body))
);

// ---- Minha Conta
const perfil = catchAsync(async (req, res) => ok(res, await conta.perfil(req.user.id)));
const atualizarDados = catchAsync(async (req, res) =>
  ok(res, await conta.atualizarDados(req.user.id, req.body, { ator: ator(req) }))
);
const atualizarEmpresa = catchAsync(async (req, res) =>
  ok(res, await conta.atualizarEmpresa(req.user.id, req.body, { ator: ator(req) }))
);
const gravarEnderecos = catchAsync(async (req, res) =>
  ok(res, await conta.gravarEnderecos(req.user.id, req.body, { ator: ator(req) }))
);
const alterarSenha = catchAsync(async (req, res) =>
  ok(res, await conta.alterarSenha(req.user.id, req.body, { ator: ator(req) }))
);

module.exports = {
  enviarAtivo,
  visaoGeral,
  painelDeVendas,
  atividades,
  compras,
  compra,
  consultas,
  consulta,
  ativos,
  ativo,
  vendas,
  pagamentos,
  perfil,
  atualizarDados,
  atualizarEmpresa,
  gravarEnderecos,
  alterarSenha,
};
