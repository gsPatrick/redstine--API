"use strict";

const db = require("../../models");
const { parsePagination } = require("../../utils/pagination");
const payoutsService = require("../payouts/payouts.service");
const { ASSET_STATUS, ORDER_STATUS } = require("../../config/constants");

/**
 * Tudo aqui e escopado ao utilizador do token.
 *
 * Existe como feature propria porque as rotas internas (`/orders`,
 * `/assets/admin`) exigem papel admin ou curador — um comprador nao veria os
 * proprios pedidos, nem um fornecedor os proprios ativos. Escopar aqui e mais
 * seguro do que afrouxar aquelas rotas.
 */

async function meusPedidos(userId, query) {
  const { page, perPage, limit, offset } = parsePagination(query);
  const where = { buyerId: userId };
  if (query.status) where.status = query.status;

  const resultado = await db.Order.findAndCountAll({
    where,
    include: [
      {
        model: db.OrderItem,
        as: "itens",
        include: [
          {
            model: db.Asset,
            as: "ativo",
            attributes: ["id", "slug", "name"],
            include: [
              {
                model: db.AssetImage,
                as: "imagens",
                attributes: ["url"],
                separate: true,
                order: [["position", "ASC"]],
                limit: 1,
              },
            ],
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  return { ...resultado, page, perPage };
}

async function meusAtivos(userId, query) {
  const { page, perPage, limit, offset } = parsePagination(query);
  const where = { supplierId: userId };
  if (query.status) where.status = query.status;

  const resultado = await db.Asset.findAndCountAll({
    where,
    include: [
      { model: db.Category, as: "categoria", attributes: ["id", "slug", "name"] },
      {
        model: db.AssetImage,
        as: "imagens",
        attributes: ["url", "position"],
        separate: true,
        order: [["position", "ASC"]],
        limit: 1,
      },
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  return { ...resultado, page, perPage };
}

async function meusEnvios(userId, query) {
  const { page, perPage, limit, offset } = parsePagination(query);
  const where = { supplierId: userId };
  if (query.status) where.status = query.status;

  const resultado = await db.Submission.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return { ...resultado, page, perPage };
}

async function minhasCotacoes(userId, query) {
  const { page, perPage, limit, offset } = parsePagination(query);
  const where = { buyerId: userId };
  if (query.status) where.status = query.status;

  const resultado = await db.Quote.findAndCountAll({
    where,
    include: [{ model: db.Asset, as: "ativo", attributes: ["id", "slug", "name", "price"] }],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  return { ...resultado, page, perPage };
}

async function meusRepasses(userId, query) {
  return payoutsService.listar(query, { supplierId: userId });
}

/**
 * Alimenta o painel do cliente numa chamada so — o front precisa dos numeros
 * de "Compras", "Vendas" e "Valor a receber" ao abrir a pagina.
 */
async function resumo(userId) {
  const [
    comprasTotal,
    comprasAbertas,
    ativosPublicados,
    ativosVendidos,
    enviosPendentes,
    favoritos,
    carteira,
  ] = await Promise.all([
    db.Order.count({ where: { buyerId: userId } }),
    db.Order.count({
      where: { buyerId: userId, status: ORDER_STATUS.AGUARDANDO_CONFIRMACAO },
    }),
    db.Asset.count({ where: { supplierId: userId, status: ASSET_STATUS.PUBLICADO } }),
    db.Asset.count({ where: { supplierId: userId, status: ASSET_STATUS.VENDIDO } }),
    db.Submission.count({
      where: { supplierId: userId, status: ["recebida", "em_avaliacao"] },
    }),
    db.Wishlist.count({ where: { userId } }),
    payoutsService.resumoDoFornecedor(userId),
  ]);

  return {
    compras: { total: comprasTotal, aguardandoConfirmacao: comprasAbertas },
    vendas: { publicados: ativosPublicados, vendidos: ativosVendidos },
    envios: { pendentes: enviosPendentes },
    favoritos,
    // Sequencia oficial: POTENCIAL -> REALIZADO -> A RECEBER -> RECEBIDO.
    carteira,
  };
}

module.exports = {
  meusPedidos,
  meusAtivos,
  meusEnvios,
  minhasCotacoes,
  meusRepasses,
  resumo,
};
