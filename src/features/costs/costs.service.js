"use strict";

const db = require("../../models");
const { AppError } = require("../../utils/app-error");
const payoutsService = require("../payouts/payouts.service");
const { PAYOUT_STATUS } = require("../../config/constants");

/**
 * Custos dedutiveis de uma venda.
 *
 * Regra (secao 5.1): "Nenhum custo pode ser abatido sem ter sido previamente
 * informado e acordado." Por isso todo custo nasce com aprovador e data — nao
 * existe custo pendente de aprovacao no modelo.
 *
 * Registrar ou remover custo recalcula os repasses do pedido, mas so enquanto
 * o valor ainda nao virou devido ao fornecedor.
 */

async function garantirPedidoEditavel(orderId, transaction) {
  const order = await db.Order.findByPk(orderId, { transaction });
  if (!order) throw AppError.notFound("Pedido nao encontrado.", "ORDER_NOT_FOUND");

  if (order.operationCompletedAt) {
    throw AppError.unprocessable(
      "Operacao concluida: os valores estao congelados e nao aceitam novos custos.",
      "OPERATION_COMPLETED",
      { concluidaEm: order.operationCompletedAt }
    );
  }

  const congelado = await db.Payout.findOne({
    where: { orderId },
    transaction,
  });
  if (congelado && congelado.status !== PAYOUT_STATUS.VENDA_REALIZADA) {
    throw AppError.unprocessable(
      "Repasse ja congelado: o custo nao pode mais ser abatido.",
      "PAYOUT_FROZEN",
      { status: congelado.status }
    );
  }

  return order;
}

async function criar(orderId, dados, { atorId }) {
  return db.sequelize.transaction(async (t) => {
    await garantirPedidoEditavel(orderId, t);

    if (dados.orderItemId) {
      const item = await db.OrderItem.findByPk(dados.orderItemId, { transaction: t });
      if (!item || item.orderId !== orderId) {
        throw AppError.badRequest(
          "O item informado nao pertence a este pedido.",
          "ORDER_ITEM_MISMATCH"
        );
      }
    }

    const custo = await db.Cost.create(
      {
        orderId,
        orderItemId: dados.orderItemId || null,
        assetId: dados.assetId || null,
        type: dados.type,
        description: dados.description,
        amount: dados.amount,
        notes: dados.notes,
        approvedBy: atorId,
        approvedAt: new Date(),
      },
      { transaction: t }
    );

    // O custo so tem efeito quando ha repasse — antes da confirmacao ele fica
    // registrado e entra na conta no momento em que os repasses nascem.
    const temRepasse = await db.Payout.count({ where: { orderId }, transaction: t });
    if (temRepasse) {
      await payoutsService.recalcularDoPedido(orderId, { transaction: t });
    }

    return custo;
  });
}

async function listar(orderId) {
  const custos = await db.Cost.findAll({
    where: { orderId },
    include: [
      { model: db.User, as: "aprovador", attributes: ["id", "name", "email"] },
      { model: db.OrderItem, as: "item", attributes: ["id", "nameSnapshot"] },
    ],
    order: [["approvedAt", "ASC"]],
  });

  const total = custos.reduce((soma, c) => soma + Number(c.amount), 0);
  return { custos, total: Number(total.toFixed(2)) };
}

async function remover(orderId, costId) {
  return db.sequelize.transaction(async (t) => {
    await garantirPedidoEditavel(orderId, t);

    const custo = await db.Cost.findOne({ where: { id: costId, orderId }, transaction: t });
    if (!custo) throw AppError.notFound("Custo nao encontrado.", "COST_NOT_FOUND");

    await custo.destroy({ transaction: t });

    const temRepasse = await db.Payout.count({ where: { orderId }, transaction: t });
    if (temRepasse) {
      await payoutsService.recalcularDoPedido(orderId, { transaction: t });
    }

    return { ok: true };
  });
}

module.exports = { criar, listar, remover };
