"use strict";

const { DataTypes } = require("sequelize");
const { PAYOUT_STATUS, MODELOS_COMERCIAIS } = require("../config/constants");

module.exports = (sequelize) => {
  /**
   * Repasse devido ao fornecedor por um item vendido.
   *
   * E aqui que o modelo comercial deixa de ser texto e vira numero: na
   * confirmacao do pedido cada item gera um Payout com o percentual do seu
   * modelo (RED Estoque 50/50, RED Catalogo 65/35, Ativo Proprio 0/100).
   *
   * O repasse nasce em VENDA_REALIZADA. So passa a A_RECEBER depois da
   * conclusao integral da operacao — antes disso o valor existe como venda,
   * nao como saldo disponivel.
   */
  const Payout = sequelize.define(
    "Payout",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      orderId: { type: DataTypes.UUID, allowNull: false },
      orderItemId: { type: DataTypes.UUID, allowNull: false },
      assetId: { type: DataTypes.UUID },
      supplierId: { type: DataTypes.UUID },

      commercialModel: {
        type: DataTypes.ENUM(...Object.values(MODELOS_COMERCIAIS)),
        allowNull: false,
      },
      supplierPercent: { type: DataTypes.INTEGER, allowNull: false },
      redPercent: { type: DataTypes.INTEGER, allowNull: false },

      /**
       * REGRA FINANCEIRA-MESTRE V1:
       *   valor_liquido = valor_bruto - custos_aprovados
       *   valor_fornecedor = valor_liquido x percentual_fornecedor
       *
       * O split incide sobre o LIQUIDO, nunca sobre o bruto.
       */
      grossAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      approvedCosts: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      netAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },

      supplierAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      redAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },

      status: {
        type: DataTypes.ENUM(...Object.values(PAYOUT_STATUS)),
        allowNull: false,
        defaultValue: PAYOUT_STATUS.VENDA_REALIZADA,
      },

      /** +48h a partir da conclusao integral (secao 17). */
      dueAt: { type: DataTypes.DATE },
      scheduledAt: { type: DataTypes.DATE },
      paidAt: { type: DataTypes.DATE },
      /** Meio do repasse (PIX, transferencia) — aparece no historico do fornecedor. */
      paymentMethod: { type: DataTypes.STRING(40) },
      paymentReference: { type: DataTypes.STRING(160) },
      notes: { type: DataTypes.TEXT },
    },
    {
      tableName: "payouts",
      underscored: true,
      indexes: [{ fields: ["supplier_id", "status"] }, { fields: ["order_id"] }],
    }
  );

  Payout.associate = (models) => {
    Payout.belongsTo(models.Order, { as: "pedido", foreignKey: "orderId" });
    Payout.belongsTo(models.OrderItem, { as: "item", foreignKey: "orderItemId" });
    Payout.belongsTo(models.Asset, { as: "ativo", foreignKey: "assetId" });
    Payout.belongsTo(models.User, { as: "fornecedor", foreignKey: "supplierId" });
  };

  return Payout;
};
