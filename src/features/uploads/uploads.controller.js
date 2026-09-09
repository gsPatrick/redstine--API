"use strict";

const service = require("./uploads.service");
const { catchAsync } = require("../../utils/catch-async");
const { ok, created, noContent } = require("../../utils/http-response");

const guardar = catchAsync(async (req, res) =>
  created(res, await service.guardarImagens(req.files))
);

// Guarda numa subpasta propria: fotos de envio ainda nao pertencem a nenhum
// ativo, e separa-las facilita a limpeza dos envios recusados.
const guardarDoEnvio = catchAsync(async (req, res) =>
  created(res, await service.guardarImagens(req.files, { subpasta: "envios" }))
);

const anexarAoAtivo = catchAsync(async (req, res) =>
  created(res, await service.anexarAoAtivo(req.params.assetId, req.files))
);

const remover = catchAsync(async (req, res) => {
  await service.removerImagem(req.params.imageId);
  noContent(res);
});

const reordenar = catchAsync(async (req, res) =>
  ok(res, await service.reordenar(req.params.assetId, req.body.imageIds))
);

module.exports = { guardar, guardarDoEnvio, anexarAoAtivo, remover, reordenar };
