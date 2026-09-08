"use strict";

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const OrderItem = sequelize.define(
    "OrderItem",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      orderId: { type: DataTypes.UUID, allowNull: false },
      assetId: { type: DataTypes.UUID },

      // Snapshot: preco e nome congelam no momento do pedido.
      nameSnapshot: { type: DataTypes.STRING(220), allowNull: false },
      unitPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      marketPriceSnapshot: { type: DataTypes.DECIMAL(12, 2) },
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      total: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    },
    { tableName: "order_items", underscored: true }
  );

  OrderItem.associate = (models) => {
    OrderItem.belongsTo(models.Order, { as: "pedido", foreignKey: "orderId" });
    OrderItem.belongsTo(models.Asset, { as: "ativo", foreignKey: "assetId" });
    OrderItem.hasMany(models.Cost, { as: "custos", foreignKey: "orderItemId" });
    OrderItem.hasOne(models.Payout, { as: "repasse", foreignKey: "orderItemId" });
  };

  return OrderItem;
};
