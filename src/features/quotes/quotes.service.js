"use strict";

const db = require("../../models");
const { AppError } = require("../../utils/app-error");
const { gerarReferencia } = require("../../utils/reference");
const { parsePagination } = require("../../utils/pagination");
const mailer = require("../../providers/mailer");
const audit = require("../audit/audit.service");
const eventos = require("../events/events.service");
const notificacoes = require("../notifications/notifications.service");
const { QUOTE_STATUS, ASSET_STATUS } = require("../../config/constants");

const INCLUDES = () => [
  {
    model: db.Asset,
    as: "ativo",
    attributes: ["id", "slug", "name", "price", "saleMode", "status"],
  },
  { model: db.User, as: "comprador", attributes: ["id", "name", "email"] },
];

/**
 * Abre uma cotacao ("sob consulta"). Existe porque a regra publicada e clara:
 * demonstrar interesse nao reserva o ativo. Nada e baixado do estoque aqui.
 */
async function criar(dados, { atorId = null } = {}) {
  const ativo = await db.Asset.findByPk(dados.assetId);
  if (!ativo) throw AppError.notFound("Ativo nao encontrado.", "ASSET_NOT_FOUND");

  if (ativo.status !== ASSET_STATUS.PUBLICADO) {
    throw AppError.unprocessable("Ativo nao esta disponivel.", "ASSET_UNAVAILABLE");
  }

  const quote = await db.Quote.create({
    ...dados,
    reference: gerarReferencia("COT"),
    buyerId: dados.buyerId || atorId,
    status: QUOTE_STATUS.NOVA,
  });

  eventos.registrar(eventos.EVENTOS.CONSULTATION_CREATED, {
    userId: quote.buyerId,
    assetId: quote.assetId,
    quoteId: quote.id,
    payload: { quantity: quote.quantity },
  });

  // A consulta pertence a relacao comprador -> RED. O fornecedor NAO e
  // notificado: nao tem acao a executar, e avisa-lo seria ruido sem funcao.
  notificacoes.notificarEquipe(notificacoes.GESTAO_COMERCIAL, notificacoes.TIPOS.NOVA_CONSULTA, {
    buyerName: quote.buyerName,
    assetName: ativo.name,
    entity: "quote",
    entityId: quote.id,
  });

  return quote;
}

async function responder(id, dados, opcoes = {}) {
  const quote = await db.Quote.findByPk(id);
  if (!quote) throw AppError.notFound("Cotacao nao encontrada.", "QUOTE_NOT_FOUND");

  if (quote.status === QUOTE_STATUS.ENCERRADA) {
    throw AppError.unprocessable("Consulta ja encerrada.", "QUOTE_CLOSED", {
      status: quote.status,
    });
  }

  await quote.update({
    quotedPrice: dados.quotedPrice,
    responseNotes: dados.responseNotes,
    status: QUOTE_STATUS.RESPONDIDA,
    respondedAt: new Date(),
  });

  mailer.cotacaoRespondida(quote).catch(() => {});

  eventos.registrar(eventos.EVENTOS.CONSULTATION_ANSWERED, {
    quoteId: quote.id,
    assetId: quote.assetId,
    userId: quote.buyerId,
  });

  await audit.registrar({
    entity: "quote",
    entityId: quote.id,
    action: "resposta",
    antes: { status: QUOTE_STATUS.EM_ATENDIMENTO },
    depois: { status: QUOTE_STATUS.RESPONDIDA, quotedPrice: dados.quotedPrice },
    ator: opcoes.ator,
  });

  notificacoes.notificar(
    quote.buyerId,
    notificacoes.TIPOS.CONSULTA_RESPONDIDA,
    {
      reference: quote.reference,
      assetName: quote.ativo?.name || "o ativo consultado",
      entity: "quote",
      entityId: quote.id,
    },
    { email: true }
  );

  return porId(quote.id);
}

async function mudarStatus(id, status, { motivo } = {}) {
  const quote = await db.Quote.findByPk(id);
  if (!quote) throw AppError.notFound("Cotacao nao encontrada.", "QUOTE_NOT_FOUND");

  const patch = { status };
  if (status === QUOTE_STATUS.ENCERRADA) {
    patch.closedAt = new Date();
    if (motivo) patch.responseNotes = motivo;
  }

  await quote.update(patch);
  return porId(quote.id);
}

async function listar(query) {
  const { page, perPage, limit, offset } = parsePagination(query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.assetId) where.assetId = query.assetId;
  if (query.buyerId) where.buyerId = query.buyerId;

  const resultado = await db.Quote.findAndCountAll({
    where,
    include: INCLUDES(),
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  return { ...resultado, page, perPage };
}

async function porId(id) {
  const quote = await db.Quote.findByPk(id, { include: INCLUDES() });
  if (!quote) throw AppError.notFound("Cotacao nao encontrada.", "QUOTE_NOT_FOUND");
  return quote;
}

/** Atribui um responsavel RED pelo atendimento (painel, secao 10). */
async function atribuir(id, assignedTo) {
  const quote = await db.Quote.findByPk(id);
  if (!quote) throw AppError.notFound("Consulta nao encontrada.", "QUOTE_NOT_FOUND");

  const patch = { assignedTo };
  // Atribuir tira da fila "nova" — passa a estar em atendimento.
  if (quote.status === QUOTE_STATUS.NOVA) patch.status = QUOTE_STATUS.EM_ATENDIMENTO;

  await quote.update(patch);
  return porId(quote.id);
}

module.exports = { criar, responder, mudarStatus, listar, porId, atribuir };
