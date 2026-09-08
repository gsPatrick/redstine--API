"use strict";

const { Op } = require("sequelize");
const db = require("../../models");
const { EVENTOS } = require("../../config/constants");

/**
 * Coleta de eventos (documento oficial, secao 24).
 *
 * Regra de ouro desta feature: registrar evento NUNCA pode derrubar a operacao
 * que o gerou. Uma compra nao falha porque o analytics falhou. Por isso todo
 * `registrar` engole o proprio erro.
 */
async function registrar(type, dados = {}, { transaction } = {}) {
  try {
    return await db.Event.create(
      {
        type,
        userId: dados.userId || null,
        assetId: dados.assetId || null,
        orderId: dados.orderId || null,
        quoteId: dados.quoteId || null,
        payload: dados.payload || {},
        sessionId: dados.sessionId || null,
        ip: dados.ip || null,
        userAgent: dados.userAgent ? String(dados.userAgent).slice(0, 300) : null,
        occurredAt: new Date(),
      },
      { transaction }
    );
  } catch (err) {
    console.error(`[events] falha ao registrar "${type}":`, err.message);
    return null;
  }
}

/** Atalho para usar dentro de um controller, ja com o contexto do request. */
function doRequest(req) {
  return {
    userId: req.user?.id || null,
    sessionId: req.headers["x-session-id"] || null,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  };
}

/** Contagem por tipo num periodo — base do analytics da V1.5. */
async function contarPorTipo({ desde = null, ate = null } = {}) {
  const where = {};
  if (desde || ate) {
    where.occurredAt = {};
    if (desde) where.occurredAt[Op.gte] = desde;
    if (ate) where.occurredAt[Op.lte] = ate;
  }

  const linhas = await db.Event.findAll({
    where,
    attributes: ["type", [db.sequelize.fn("COUNT", db.sequelize.col("id")), "total"]],
    group: ["type"],
    raw: true,
  });

  const base = Object.fromEntries(Object.values(EVENTOS).map((t) => [t, 0]));
  for (const l of linhas) base[l.type] = Number(l.total);
  return base;
}

/**
 * Funil de um ativo: visualizacoes -> favoritos -> consultas -> compras.
 * Nao exibido na V1, mas ja consultavel — e o que a secao 21 chama de V2.
 */
async function funilDoAtivo(assetId) {
  const linhas = await db.Event.findAll({
    where: { assetId },
    attributes: ["type", [db.sequelize.fn("COUNT", db.sequelize.col("id")), "total"]],
    group: ["type"],
    raw: true,
  });

  const por = Object.fromEntries(linhas.map((l) => [l.type, Number(l.total)]));
  return {
    visualizacoes: por[EVENTOS.PRODUCT_VIEW] || 0,
    favoritos: por[EVENTOS.FAVORITE_ADDED] || 0,
    consultas: por[EVENTOS.CONSULTATION_CREATED] || 0,
    compras: por[EVENTOS.PURCHASE_COMPLETED] || 0,
  };
}

module.exports = { registrar, doRequest, contarPorTipo, funilDoAtivo, EVENTOS };
