"use strict";

const db = require("../../models");
const { AppError } = require("../../utils/app-error");
const { gerarReferencia } = require("../../utils/reference");
const { parsePagination } = require("../../utils/pagination");
const mailer = require("../../providers/mailer");
const audit = require("../audit/audit.service");
const notificacoes = require("../notifications/notifications.service");
const { SUBMISSION_STATUS } = require("../../config/constants");

/**
 * Recebe o envio da pagina Vender. Regra publicada no site: "o envio nao
 * garante a publicacao" — por isso nasce em RECEBIDA e nunca cria Asset aqui.
 */
async function criar(dados, { atorId = null } = {}) {
  if (!dados.authorized) {
    throw AppError.unprocessable(
      "E necessario declarar autorizacao sobre os ativos.",
      "AUTHORIZATION_REQUIRED"
    );
  }

  const submission = await db.Submission.create({
    ...dados,
    reference: gerarReferencia("RED"),
    supplierId: dados.supplierId || atorId,
    status: SUBMISSION_STATUS.RECEBIDA,
  });

  // Notificacao nunca bloqueia: o envio ja esta gravado.
  mailer.envioRecebido(submission).catch(() => {});

  await audit.registrar({
    entity: "submission",
    entityId: submission.id,
    action: "cadastro",
    depois: { status: submission.status, reference: submission.reference },
    ator: { id: atorId },
  });

  notificacoes.notificarEquipe(notificacoes.GESTAO_COMERCIAL, notificacoes.TIPOS.NOVO_ENVIO, {
    reference: submission.reference,
    entity: "submission",
    entityId: submission.id,
  });

  return submission;
}

async function listar(query) {
  const { page, perPage, limit, offset } = parsePagination(query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.supplierId) where.supplierId = query.supplierId;

  const resultado = await db.Submission.findAndCountAll({
    where,
    include: [{ model: db.User, as: "fornecedor", attributes: ["id", "name", "email"] }],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return { ...resultado, page, perPage };
}

async function porId(id) {
  const submission = await db.Submission.findByPk(id, {
    include: [
      { model: db.User, as: "fornecedor", attributes: ["id", "name", "email"] },
      {
        model: db.Evaluation,
        as: "avaliacoes",
        include: [{ model: db.Asset, as: "ativo", attributes: ["id", "slug", "name", "status"] }],
      },
    ],
    order: [[{ model: db.Evaluation, as: "avaliacoes" }, "createdAt", "DESC"]],
  });
  if (!submission) throw AppError.notFound("Envio nao encontrado.", "SUBMISSION_NOT_FOUND");
  return submission;
}

/** Move para EM_AVALIACAO. A decisao final vive na feature evaluations. */
async function iniciarAvaliacao(id) {
  const submission = await db.Submission.findByPk(id);
  if (!submission) throw AppError.notFound("Envio nao encontrado.", "SUBMISSION_NOT_FOUND");

  if (submission.status !== SUBMISSION_STATUS.RECEBIDA) {
    throw AppError.unprocessable(
      "Apenas envios recebidos podem entrar em avaliacao.",
      "INVALID_SUBMISSION_STATUS",
      { status: submission.status }
    );
  }

  await submission.update({ status: SUBMISSION_STATUS.EM_AVALIACAO });
  return submission;
}

/**
 * Corrige os dados de um envio.
 *
 * O envio chega por formulario livre — nome de ativo abreviado, cidade sem UF,
 * quantidade escrita no campo errado. A curadoria precisa arrumar isso ANTES
 * de aprovar, porque e a partir daqui que o ativo nasce; corrigir so depois
 * significaria arrumar duas vezes, no envio e no ativo.
 *
 * Fica registado em auditoria com o antes e o depois: alterar o que um terceiro
 * declarou tem de ser rastreavel.
 */
async function atualizar(id, dados, { atorId = null } = {}) {
  const submission = await db.Submission.findByPk(id);
  if (!submission) throw AppError.notFound("Envio nao encontrado.", "SUBMISSION_NOT_FOUND");

  const antes = submission.toJSON();

  // `attributes` e mesclado, nao substituido: o formulario da curadoria manda
  // so os campos que mostra, e trocar o objeto inteiro apagaria `origem` e o
  // que mais tenha sido gravado no envio.
  const patch = { ...dados };
  if (dados.attributes) {
    patch.attributes = { ...(submission.attributes || {}), ...dados.attributes };
  }

  await submission.update(patch);

  const mudou = Object.keys(dados).filter(
    (k) => JSON.stringify(antes[k]) !== JSON.stringify(submission[k])
  );

  await audit.registrar({
    entity: "submission",
    entityId: submission.id,
    action: "edicao",
    antes: Object.fromEntries(mudou.map((k) => [k, antes[k]])),
    depois: Object.fromEntries(mudou.map((k) => [k, submission[k]])),
    ator: { id: atorId },
  });

  return porId(submission.id);
}

module.exports = { criar, listar, porId, iniciarAvaliacao, atualizar };
