"use strict";

const multer = require("multer");
const { env } = require("../config/env");
const { AppError } = require("../utils/app-error");

/**
 * Recebe em memoria e delega a escrita ao provider de storage — assim trocar
 * disco por S3 nao exige mexer no middleware.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.upload.maxFileSizeMb * 1024 * 1024,
    files: 20,
  },
  fileFilter(req, file, cb) {
    if (env.upload.allowedMime.includes(file.mimetype)) return cb(null, true);
    cb(
      AppError.unprocessable(
        `Tipo de ficheiro nao permitido: ${file.mimetype}.`,
        "UNSUPPORTED_MEDIA_TYPE",
        { permitidos: env.upload.allowedMime }
      )
    );
  },
});

/** Traduz os erros do multer para o contrato de erro da API. */
function traduzirErroUpload(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return next(
        AppError.unprocessable(
          `Ficheiro acima do limite de ${env.upload.maxFileSizeMb} MB.`,
          "FILE_TOO_LARGE"
        )
      );
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return next(AppError.unprocessable("Demasiados ficheiros.", "TOO_MANY_FILES"));
    }
    return next(AppError.badRequest(err.message, "UPLOAD_ERROR"));
  }
  return next(err);
}

const imagens = (campo = "files", max = 20) => [upload.array(campo, max), traduzirErroUpload];

module.exports = { upload, imagens, traduzirErroUpload };
