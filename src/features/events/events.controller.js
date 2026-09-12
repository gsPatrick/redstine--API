"use strict";

const service = require("./events.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, created } = require("../../utils/http-response");

/**
 * Unico evento que o front reporta explicitamente: a visualizacao de produto.
 * Os outros nove nascem no backend, no momento em que a acao acontece — assim
 * nao dependem de o cliente lembrar de avisar.
 *
 * A resposta devolve o total do ativo e se ESTA chamada contou. Sem isso a
 * pagina do produto teria de buscar a contagem numa segunda requisicao logo
 * depois de reportar a visita — duas viagens para a mesma informacao.
 */
const registrarVisualizacao = catchAsync(async (req, res) => {
  const r = await service.registrarVisualizacao({
    ...service.doRequest(req),
    assetId: req.body.assetId,
    payload: req.body.payload || {},
  });
  created(res, { ok: true, contabilizada: r.contabilizada, visualizacoes: r.visualizacoes });
});

const resumo = catchAsync(async (req, res) =>
  ok(res, await service.contarPorTipo({ desde: req.query.desde, ate: req.query.ate }))
);

const funil = catchAsync(async (req, res) =>
  ok(res, await service.funilDoAtivo(req.params.assetId))
);

module.exports = { registrarVisualizacao, resumo, funil };
