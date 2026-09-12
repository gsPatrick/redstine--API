"use strict";

const crypto = require("node:crypto");
const { Op } = require("sequelize");
const db = require("../../models");
const { EVENTOS, JANELA_VISUALIZACAO_MINUTOS } = require("../../config/constants");

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

/**
 * Chave do visitante, para nao contar o mesmo olho duas vezes.
 *
 * Tres niveis, do mais confiavel ao ultimo recurso:
 *
 *   u:<id>    utilizador autenticado — e a identidade real, vale mais do que
 *             qualquer cookie e sobrevive a trocar de aparelho.
 *   s:<id>    identificador de sessao que o front gera e guarda no navegador
 *             (cabecalho `x-session-id`). Cobre o visitante anonimo, que e a
 *             maioria do trafego.
 *   a:<hash>  impressao de IP + user-agent, quando nem sessao ha. E deliberado
 *             que seja um HASH e nao o IP em claro: serve para comparar duas
 *             visitas, nao para identificar uma pessoa.
 *
 * A chave vai no proprio campo `sessionId` do evento, que ja existe e ja tem
 * indice — criar coluna nova para guardar a mesma coisa duplicaria o dado.
 */
function chaveDoVisitante({ userId, sessionId, ip, userAgent }) {
  if (userId) return `u:${userId}`;
  if (sessionId) return `s:${String(sessionId).slice(0, 60)}`;
  const impressao = crypto
    .createHash("sha256")
    .update(`${ip || ""}|${userAgent || ""}`)
    .digest("hex");
  return `a:${impressao.slice(0, 60)}`;
}

/**
 * Visualizacao de produto — o unico evento que o front reporta.
 *
 * Duas coisas acontecem aqui, e as duas precisam de acontecer juntas:
 *
 *  1. DEDUPLICACAO. Sem ela o F5 virava metrica: um ativo com tres refreshes
 *     parecia mais procurado do que um visto por tres pessoas. Dentro da
 *     janela, o mesmo visitante no mesmo ativo conta uma vez — e a chamada
 *     repetida devolve 200 com `contabilizada: false`, nao um erro. O front
 *     nao tem de saber se ja contou; a API e que decide.
 *
 *  2. INCREMENTO DO CONTADOR do ativo. `increment` emite um UPDATE atomico
 *     (`views_count = views_count + 1`) em vez de ler-somar-gravar: duas
 *     visitas simultaneas ao mesmo ativo perderiam uma no caminho de leitura.
 *
 * Como todo evento, nada aqui derruba a operacao que o gerou — uma falha de
 * analytics nao pode tirar a pagina do produto do ar.
 */
async function registrarVisualizacao({ assetId, payload = {}, ...contexto }) {
  const chave = chaveDoVisitante(contexto);

  try {
    const desde = new Date(Date.now() - JANELA_VISUALIZACAO_MINUTOS * 60 * 1000);
    const repetida = await db.Event.findOne({
      where: {
        type: EVENTOS.PRODUCT_VIEW,
        assetId,
        sessionId: chave,
        occurredAt: { [Op.gte]: desde },
      },
      attributes: ["id"],
    });

    if (repetida) {
      const ativo = await db.Asset.findByPk(assetId, { attributes: ["viewsCount"] });
      return { contabilizada: false, visualizacoes: ativo?.viewsCount ?? 0 };
    }

    await registrar(EVENTOS.PRODUCT_VIEW, { ...contexto, assetId, payload, sessionId: chave });

    const [, linhas] = await db.Asset.increment("viewsCount", { by: 1, where: { id: assetId } });
    // `increment` nao devolve o valor novo em todos os dialetos: relê para a
    // resposta poder mostrar o numero certo sem o front ter de recarregar.
    const ativo = await db.Asset.findByPk(assetId, { attributes: ["viewsCount"] });
    return { contabilizada: true, visualizacoes: ativo?.viewsCount ?? 0, linhas };
  } catch (err) {
    console.error("[events] falha ao contar visualizacao:", err.message);
    return { contabilizada: false, visualizacoes: null };
  }
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

module.exports = {
  registrar,
  registrarVisualizacao,
  chaveDoVisitante,
  doRequest,
  contarPorTipo,
  funilDoAtivo,
  EVENTOS,
};
