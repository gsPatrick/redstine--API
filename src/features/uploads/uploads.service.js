"use strict";

const db = require("../../models");
const storage = require("../../providers/storage");
const { AppError } = require("../../utils/app-error");

/** Guarda ficheiros e devolve as URLs — nao toca em nenhum ativo. */
async function guardarImagens(files, { subpasta = "assets" } = {}) {
  if (!files || !files.length) {
    throw AppError.badRequest("Nenhum ficheiro enviado.", "NO_FILES");
  }

  return Promise.all(
    files.map((f) =>
      storage.guardar({ buffer: f.buffer, mimetype: f.mimetype, subpasta })
    )
  );
}

/** Guarda e ja anexa ao ativo, na ordem em que chegaram. */
async function anexarAoAtivo(assetId, files) {
  const asset = await db.Asset.findByPk(assetId);
  if (!asset) throw AppError.notFound("Ativo nao encontrado.", "ASSET_NOT_FOUND");

  const guardados = await guardarImagens(files, { subpasta: `assets/${assetId}` });

  const ultima = await db.AssetImage.max("position", { where: { assetId } });
  const inicio = Number.isFinite(ultima) ? ultima + 1 : 0;

  const imagens = await db.AssetImage.bulkCreate(
    guardados.map((g, i) => ({
      assetId,
      url: g.url,
      position: inicio + i,
    }))
  );

  return imagens;
}

async function removerImagem(imageId) {
  const imagem = await db.AssetImage.findByPk(imageId);
  if (!imagem) throw AppError.notFound("Imagem nao encontrada.", "IMAGE_NOT_FOUND");

  // Best-effort no disco: o registro sai mesmo que o ficheiro ja nao exista.
  const marcador = `/${require("../../config/env").env.upload.dir}/`;
  const idx = imagem.url.indexOf(marcador);
  if (idx >= 0) {
    await storage.remover(imagem.url.slice(idx + marcador.length)).catch(() => {});
  }

  await imagem.destroy();
  return { ok: true };
}

/** Reordena as imagens de um ativo pela ordem dos ids recebidos. */
async function reordenar(assetId, imageIds) {
  const imagens = await db.AssetImage.findAll({ where: { assetId } });
  const existentes = new Set(imagens.map((i) => i.id));

  const desconhecidos = imageIds.filter((id) => !existentes.has(id));
  if (desconhecidos.length) {
    throw AppError.badRequest("Ids de imagem nao pertencem ao ativo.", "IMAGE_MISMATCH", {
      desconhecidos,
    });
  }

  await db.sequelize.transaction(async (t) => {
    await Promise.all(
      imageIds.map((id, i) =>
        db.AssetImage.update({ position: i }, { where: { id }, transaction: t })
      )
    );
  });

  return db.AssetImage.findAll({ where: { assetId }, order: [["position", "ASC"]] });
}

module.exports = { guardarImagens, anexarAoAtivo, removerImagem, reordenar };
