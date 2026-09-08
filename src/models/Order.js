"use strict";

const { DataTypes } = require("sequelize");
const {
  ORDER_STATUS,
  PAGAMENTOS,
  PAYMENT_STATUS,
  PICKUP_STATUS,
} = require("../config/constants");

module.exports = (sequelize) => {
  /**
   * Pedido de compra direta. Regra do negocio: o envio do pedido NAO caracteriza
   * reserva automatica — por isso o status inicial e AGUARDANDO_CONFIRMACAO e a
   * baixa de estoque so ocorre quando a RED confirma.
   */
  const Order = sequelize.define(
    "Order",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      reference: { type: DataTypes.STRING(24), allowNull: false, unique: true },
      buyerId: { type: DataTypes.UUID },

      // Snapshot do comprador: o pedido precisa sobreviver a mudanca de cadastro.
      buyerName: { type: DataTypes.STRING(160), allowNull: false },
      buyerEmail: { type: DataTypes.STRING(180), allowNull: false },
      buyerPhone: { type: DataTypes.STRING(40) },
      buyerDocument: { type: DataTypes.STRING(32) },
      billing: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },

      status: {
        type: DataTypes.ENUM(...Object.values(ORDER_STATUS)),
        allowNull: false,
        defaultValue: ORDER_STATUS.AGUARDANDO_CONFIRMACAO,
      },
      paymentMethod: {
        type: DataTypes.ENUM(...Object.values(PAGAMENTOS)),
        allowNull: false,
        defaultValue: PAGAMENTOS.PIX,
      },

      /**
       * Pagamento e retirada sao rastreados a parte do status do pedido: sao
       * duas das condicoes da conclusao integral da operacao (secao 15), e o
       * documento pede que os status financeiros sejam independentes dos status
       * de ativo e de retirada.
       */
      paymentStatus: {
        type: DataTypes.ENUM(...Object.values(PAYMENT_STATUS)),
        allowNull: false,
        defaultValue: PAYMENT_STATUS.AGUARDANDO,
      },
      paymentConfirmedAt: { type: DataTypes.DATE },

      pickupStatus: {
        type: DataTypes.ENUM(...Object.values(PICKUP_STATUS)),
        allowNull: false,
        defaultValue: PICKUP_STATUS.AGUARDANDO,
      },
      pickupCompletedAt: { type: DataTypes.DATE },

      /** Carimbo da conclusao integral — dispara o "a receber" e o prazo. */
      operationCompletedAt: { type: DataTypes.DATE },
      hasOpenIssue: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      approvedCosts: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      total: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },

      /**
       * Retirada e transporte sao confirmados antes da conclusao — nao ha frete
       * calculado automaticamente.
       */
      /**
       * Retirada estruturada. O Detalhe da Compra renderiza estes campos
       * separadamente — um bloco de texto livre nao da para exibir "Local",
       * "Endereço" e "Responsável" em linhas proprias.
       */
      pickupLocation: { type: DataTypes.STRING(160) },
      pickupAddress: { type: DataTypes.STRING(300) },
      pickupContactName: { type: DataTypes.STRING(140) },
      pickupContactPhone: { type: DataTypes.STRING(40) },
      pickupScheduledAt: { type: DataTypes.DATE },
      pickupInstructions: { type: DataTypes.TEXT },
      pickupNotes: { type: DataTypes.TEXT },
      notes: { type: DataTypes.TEXT },
      confirmedAt: { type: DataTypes.DATE },
      concludedAt: { type: DataTypes.DATE },
      canceledAt: { type: DataTypes.DATE },
      cancelReason: { type: DataTypes.TEXT },
    },
    { tableName: "orders", underscored: true, indexes: [{ fields: ["status"] }] }
  );

  Order.associate = (models) => {
    Order.belongsTo(models.User, { as: "comprador", foreignKey: "buyerId" });
    Order.hasMany(models.OrderItem, {
      as: "itens",
      foreignKey: "orderId",
      onDelete: "CASCADE",
    });
    Order.hasMany(models.Cost, {
      as: "custos",
      foreignKey: "orderId",
      onDelete: "CASCADE",
    });
    Order.hasMany(models.Payout, {
      as: "repasses",
      foreignKey: "orderId",
      onDelete: "CASCADE",
    });
  };

  return Order;
};
