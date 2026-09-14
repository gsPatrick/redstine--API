"use strict";

const service = require("./management.service");
const comercial = require("./management.comercial");
const financeiro = require("./management.financeiro");
const operacao = require("./management.operacao");
const relatorios = require("./management.relatorios");
const settings = require("../settings/settings.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, paginated } = require("../../utils/http-response");
const { capacidadesDe } = require("../../middlewares/capability");
const { CAPABILITIES } = require("../../config/constants");

const ator = (req) => ({ id: req.user.id, role: req.user.role });
const lista = (res, r, extra = {}) =>
  res.status(200).json({
    data: r.rows,
    meta: {
      page: r.page,
      perPage: r.perPage,
      total: r.count,
      totalPages: Math.max(1, Math.ceil(r.count / r.perPage)),
      ...extra,
      ...(r.totais ? { totais: r.totais } : {}),
      ...(r.resumo ? { resumo: r.resumo } : {}),
    },
  });

// ---------------------------------------------------------------- Visão Geral
/**
 * As capacidades vao para o service, nao ficam so na rota.
 *
 * A Visao Geral e a unica rota que TRES areas partilham, e por isso o corte
 * nao pode ser por rota: e o conteudo do payload que muda por perfil. Passar a
 * lista aqui e o que impede o perfil Comercial de receber receita da RED
 * dentro de um objeto que ele tem direito de pedir.
 */
const visaoGeral = catchAsync(async (req, res) =>
  ok(res, await service.visaoGeral(req.query, capacidadesDe(req.user)))
);

// ------------------------------------------------------------------ Comercial
const painelComercial = catchAsync(async (req, res) => ok(res, await service.comercial(req.query)));
const consultas = catchAsync(async (req, res) => lista(res, await comercial.consultas(req.query)));
const resumoConsultas = catchAsync(async (req, res) =>
  ok(res, await comercial.resumoDeConsultas(req.query))
);
const ativos = catchAsync(async (req, res) => lista(res, await comercial.ativos(req.query)));
const vendas = catchAsync(async (req, res) => lista(res, await comercial.vendas(req.query)));
const resumoVendas = catchAsync(async (req, res) => ok(res, await comercial.resumoDeVendas(req.query)));

// ------------------------------------------------------------------- Operação
const painelOperacao = catchAsync(async (req, res) =>
  ok(res, await operacao.indicadores(req.query))
);
const ativosOperacao = catchAsync(async (req, res) => lista(res, await operacao.ativos(req.query)));
const ativoOperacional = catchAsync(async (req, res) =>
  ok(res, await operacao.detalhe(req.params.id))
);
const inventarioPorCategoria = catchAsync(async (req, res) =>
  ok(res, await operacao.inventarioPorCategoria(req.query))
);

// ------------------------------------------------------------------ Financeiro
const painelFinanceiro = catchAsync(async (req, res) => ok(res, await service.financeiro(req.query)));
const indicadores = catchAsync(async (req, res) => ok(res, await financeiro.indicadores(req.query)));
const movimentacoes = catchAsync(async (req, res) =>
  lista(res, await financeiro.movimentacoes(req.query))
);
const movimentacao = catchAsync(async (req, res) =>
  ok(res, await financeiro.movimentacao(req.params.id))
);
const repasses = catchAsync(async (req, res) => lista(res, await financeiro.repasses(req.query)));

// ------------------------------------------------------------------ Relatórios
const evolucao = catchAsync(async (req, res) =>
  ok(
    res,
    await relatorios.evolucaoDeVendas(req.query, {
      // A receita da RED por mes so acompanha a serie para quem tem capacidade
      // financeira. A rota e comercial, e o campo passava na boleia.
      comFinanceiro: capacidadesDe(req.user).includes(CAPABILITIES.FINANCIAL_READ),
    })
  )
);
const porCategoria = catchAsync(async (req, res) =>
  ok(res, await relatorios.vendasPorCategoria(req.query))
);
const porModelo = catchAsync(async (req, res) =>
  ok(res, await relatorios.resultadoPorModelo(req.query))
);
const porFornecedor = catchAsync(async (req, res) =>
  ok(res, await relatorios.porFornecedor(req.query))
);

const exportar = catchAsync(async (req, res) => {
  const dados = await relatorios.exportar(req.params.recorte, req.query);

  if ((req.query.formato || "json") !== "csv") return ok(res, dados);

  const nome = `red-${dados.recorte}-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
  return res.status(200).send(relatorios.paraCSV(dados));
});

// ------------------------------------------------------------------ Permissões
const permissoes = catchAsync(async (req, res) => ok(res, relatorios.permissoes()));

// --------------------------------------------------------------- Configurações
const configuracoes = catchAsync(async (req, res) => ok(res, await settings.todas()));
const gravarConfiguracoes = catchAsync(async (req, res) =>
  ok(res, await settings.gravar(req.body, { ator: ator(req) }))
);

module.exports = {
  visaoGeral,
  painelComercial,
  consultas,
  resumoConsultas,
  ativos,
  vendas,
  resumoVendas,
  painelOperacao,
  ativosOperacao,
  ativoOperacional,
  inventarioPorCategoria,
  painelFinanceiro,
  indicadores,
  movimentacoes,
  movimentacao,
  repasses,
  evolucao,
  porCategoria,
  porModelo,
  porFornecedor,
  exportar,
  permissoes,
  configuracoes,
  gravarConfiguracoes,
};
