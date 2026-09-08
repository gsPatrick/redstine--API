"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { env } = require("../../config/env");
const { AppError } = require("../../utils/app-error");

/**
 * Armazenamento de ficheiros em disco local.
 *
 * Fica atras desta interface de proposito: trocar por S3, R2 ou Spaces e
 * reescrever `guardar` e `remover`, sem tocar em nenhum service. Em producao
 * com mais de uma instancia, disco local nao serve — o ficheiro so existiria
 * na maquina que recebeu o upload.
 */

const EXTENSAO = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
};

function raiz() {
  return path.resolve(process.cwd(), env.upload.dir);
}

async function garantirPasta(subpasta) {
  const destino = path.join(raiz(), subpasta);
  await fs.mkdir(destino, { recursive: true });
  return destino;
}

/** Nome aleatorio: o nome original do cliente nunca vira caminho no disco. */
function nomeSeguro(mimetype) {
  const ext = EXTENSAO[mimetype];
  if (!ext) {
    throw AppError.unprocessable(
      `Tipo de ficheiro nao permitido: ${mimetype}.`,
      "UNSUPPORTED_MEDIA_TYPE",
      { permitidos: env.upload.allowedMime }
    );
  }
  return `${crypto.randomBytes(16).toString("hex")}${ext}`;
}

async function guardar({ buffer, mimetype, subpasta = "assets" }) {
  if (!env.upload.allowedMime.includes(mimetype)) {
    throw AppError.unprocessable(
      `Tipo de ficheiro nao permitido: ${mimetype}.`,
      "UNSUPPORTED_MEDIA_TYPE",
      { permitidos: env.upload.allowedMime }
    );
  }

  const limite = env.upload.maxFileSizeMb * 1024 * 1024;
  if (buffer.length > limite) {
    throw AppError.unprocessable(
      `Ficheiro acima do limite de ${env.upload.maxFileSizeMb} MB.`,
      "FILE_TOO_LARGE"
    );
  }

  const nome = nomeSeguro(mimetype);
  const pasta = await garantirPasta(subpasta);
  await fs.writeFile(path.join(pasta, nome), buffer);

  const caminhoRelativo = `${subpasta}/${nome}`;
  return {
    path: caminhoRelativo,
    url: `${env.app.publicUrl}/${env.upload.dir}/${caminhoRelativo}`,
    size: buffer.length,
    mimetype,
  };
}

async function remover(caminhoRelativo) {
  // Nunca deixa sair da raiz de uploads, mesmo com "../" no caminho.
  const alvo = path.resolve(raiz(), caminhoRelativo);
  if (!alvo.startsWith(raiz())) {
    throw AppError.badRequest("Caminho invalido.", "INVALID_PATH");
  }
  await fs.rm(alvo, { force: true });
  return { ok: true };
}

module.exports = { guardar, remover, raiz };
