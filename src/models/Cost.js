"use strict";

const { DataTypes } = require("sequelize");
const { TIPOS_CUSTO } = require("../config/constants");

module.exports = (sequelize) => {
  /**
   * Custo dedutivel de uma venda (documento oficial, secoes 5.1 e 6).
   *
   * A regra e explicita: custos devem ser cadastrados INDIVIDUALMENTE, nunca
   * como um valor total, "para preservar auditoria e transparencia". E nenhum
   * custo pode ser abatido sem ter sido previamente informado e acordado — por
   * isso `approvedBy` e `approvedAt` sao obrigatorios.
   *
   * O custo entra na conta antes do split:
   *   valor_liquido = valor_bruto - custos_aprovados
   */
  const Cost = sequelize.define(
    "Cost",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      orderId: { type: DataTypes.UUID, allowNull: false },

      /**
       * Quando preenchido, o custo pertence aquele item. Quando nulo, e um
       * custo do pedido inteiro e sera rateado entre os itens pela participacao
       * de cada um no bruto.
       */
      orderItemId: { type: DataTypes.UUID },
      assetId: { type: DataTypes.UUID },

      type: { type: DataTypes.ENUM(...TIPOS_CUSTO), allowNull: false },
      description: { type: DataTypes.STRING(300), allowNull: false },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },

      // Quem aprovou e quando — sem isto o custo nao pode ser abatido.
      approvedBy: { type: DataTypes.UUID, allowNull: false },
      approvedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },

      notes: { type: DataTypes.TEXT },
    },
    {
      tableName: "costs",
      underscored: true,
      indexes: [{ fields: ["order_id"] }, { fields: ["order_item_id"] }],
    }
  );

  Cost.associate = (models) => {
    Cost.belongsTo(models.Order, { as: "pedido", foreignKey: "orderId" });
    Cost.belongsTo(models.OrderItem, { as: "item", foreignKey: "orderItemId" });
    Cost.belongsTo(models.Asset, { as: "ativo", foreignKey: "assetId" });
    Cost.belongsTo(models.User, { as: "aprovador", foreignKey: "approvedBy" });
  };

  return Cost;
};
