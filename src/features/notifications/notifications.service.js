"use strict";

const { Op } = require("sequelize");
const db = require("../../models");
const { AppError } = require("../../utils/app-error");
const { parsePagination } = require("../../utils/pagination");
const { NOTIFICACOES, ROLES } = require("../../config/constants");
const mailer = require("../../providers/mailer");
const { env } = require("../../config/env");

/**
 * Notificacoes do sino.
 *
 * Canais da V1: area do cliente + e-mail. O documento descarta push e SMS por
 * agora. Como eventos e auditoria, nunca derruba a operacao que a gerou.
 */

const MODELOS = {
  [NOTIFICACOES.CONSULTA_RESPONDIDA]: (d) => ({
    title: "Sua consulta foi respondida",
    body: `Respondemos a consulta ${d.reference} sobre ${d.assetName}.`,
    link: `/my-account/consultas/${d.entityId}`,
  }),
  [NOTIFICACOES.COMPRA_CONFIRMADA]: (d) => ({
    title: `Compra ${d.reference} confirmada`,
    body: "Sua compra foi confirmada pela RED.",
    link: `/my-account/compras/${d.entityId}`,
  }),
  [NOTIFICACOES.COMPRA_PRONTA_RETIRADA]: (d) => ({
    title: `Compra ${d.reference} disponivel para retirada`,
    body: "Combine a retirada com a equipe da RED.",
    link: `/my-account/compras/${d.entityId}`,
  }),
  [NOTIFICACOES.ATIVO_AGUARDANDO_APROVACAO]: (d) => ({
    title: "Seu ativo aguarda sua aprovacao",
    body: `"${d.assetName}" passou pela curadoria. Aprove preco e modelo para publicarmos.`,
    link: `/my-account/ativos/${d.entityId}`,
  }),
  [NOTIFICACOES.ATIVO_PUBLICADO]: (d) => ({
    title: "Ativo publicado",
    body: `"${d.assetName}" ja esta no catalogo da RED.`,
    link: `/my-account/ativos/${d.entityId}`,
  }),
  [NOTIFICACOES.ATIVO_VENDIDO]: (d) => ({
    title: "Ativo vendido",
    body: `"${d.assetName}" foi vendido.`,
    link: `/my-account/vendas`,
  }),
  [NOTIFICACOES.VALOR_A_RECEBER]: (d) => ({
    title: "Valor disponivel para repasse",
    body: `A operacao foi concluida e R$ ${d.amount} entrou em "a receber".`,
    link: `/my-account/financeiro`,
  }),
  [NOTIFICACOES.PAGAMENTO_REALIZADO]: (d) => ({
    title: "Pagamento realizado",
    body: `Repasse de R$ ${d.amount} efetuado.`,
    link: `/my-account/financeiro`,
  }),
  [NOTIFICACOES.NOVA_CONSULTA]: (d) => ({
    title: "Nova consulta recebida",
    body: `${d.buyerName} consultou "${d.assetName}".`,
    link: `/gestao/comercial/consultas/${d.entityId}`,
  }),
  [NOTIFICACOES.NOVO_ENVIO]: (d) => ({
    title: "Novo ativo enviado para avaliacao",
    body: `Envio ${d.reference} aguardando curadoria.`,
    link: `/gestao/comercial/envios/${d.entityId}`,
  }),
  [NOTIFICACOES.VENDA_REALIZADA]: (d) => ({
    title: "Venda realizada",
    body: `Pedido ${d.reference} confirmado.`,
    link: `/gestao/comercial/vendas/${d.entityId}`,
  }),
  [NOTIFICACOES.REPASSE_PENDENTE]: (d) => ({
    title: "Repasse pendente",
    body: `R$ ${d.amount} aguardando pagamento ao fornecedor.`,
    link: `/gestao/financeiro/repasses`,
  }),
};

/**
 * Cria a notificacao para um utilizador.
 * `email: true` envia tambem por e-mail — o segundo canal da V1.
 */
async function notificar(userId, type, dados = {}, { transaction, email = false } = {}) {
  if (!userId) return null;

  try {
    const modelo = MODELOS[type];
    if (!modelo) throw new Error(`Tipo de notificacao desconhecido: ${type}`);

    const { title, body, link } = modelo(dados);

    const notificacao = await db.Notification.create(
      {
        userId,
        type,
        title,
        body,
        link,
        entity: dados.entity || null,
        entityId: dados.entityId || null,
      },
      { transaction }
    );

    if (email) {
      const user = await db.User.findByPk(userId, { transaction });
      if (user?.email) {
        // Fora da transacao logica: e-mail nao participa de rollback.
        setImmediate(() => {
          mailer
            .avulso({
              to: user.email,
              subject: title,
              text: `${body}\n\n${env.app.siteUrl}${link || ""}\n\nEquipe RED`,
            })
            .then(() => notificacao.update({ emailedAt: new Date() }))
            .catch(() => {});
        });
      }
    }

    return notificacao;
  } catch (err) {
    console.error(`[notificacoes] falha ao criar "${type}":`, err.message);
    return null;
  }
}

/** Avisa toda a equipe interna com um dado papel. */
async function notificarEquipe(papeis, type, dados = {}, opcoes = {}) {
  try {
    const equipe = await db.User.findAll({
      where: { role: { [Op.in]: papeis }, status: "ativo" },
      attributes: ["id"],
      transaction: opcoes.transaction,
    });
    return Promise.all(equipe.map((u) => notificar(u.id, type, dados, opcoes)));
  } catch (err) {
    console.error("[notificacoes] falha ao notificar equipe:", err.message);
    return [];
  }
}

const GESTAO_COMERCIAL = [ROLES.ADMIN, ROLES.CURADOR, ROLES.COMERCIAL];
const GESTAO_FINANCEIRA = [ROLES.ADMIN, ROLES.FINANCEIRO];

async function listar(userId, query = {}) {
  const { page, perPage, limit, offset } = parsePagination(query);
  const where = { userId };
  if (query.apenasNaoLidas) where.readAt = null;

  const resultado = await db.Notification.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return { ...resultado, page, perPage };
}

/** O numero do badge do sino. */
async function contarNaoLidas(userId) {
  const total = await db.Notification.count({ where: { userId, readAt: null } });
  return { naoLidas: total };
}

async function marcarLida(userId, id) {
  const notificacao = await db.Notification.findOne({ where: { id, userId } });
  if (!notificacao) throw AppError.notFound("Notificacao nao encontrada.", "NOTIFICATION_NOT_FOUND");
  if (!notificacao.readAt) await notificacao.update({ readAt: new Date() });
  return notificacao;
}

async function marcarTodasLidas(userId) {
  const [afetadas] = await db.Notification.update(
    { readAt: new Date() },
    { where: { userId, readAt: null } }
  );
  return { atualizadas: afetadas };
}

module.exports = {
  notificar,
  notificarEquipe,
  listar,
  contarNaoLidas,
  marcarLida,
  marcarTodasLidas,
  GESTAO_COMERCIAL,
  GESTAO_FINANCEIRA,
  TIPOS: NOTIFICACOES,
};
