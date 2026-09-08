"use strict";

const { DataTypes } = require("sequelize");
const { QUOTE_STATUS } = require("../config/constants");

module.exports = (sequelize) => {
  /**
   * Cotacao ("sob consulta"). Existe porque a regra e explicita: demonstrar
   * interesse nao reserva o ativo. Grandes lotes, equipamentos e itens volumosos
   * passam por aqui em vez de virar pedido direto.
   */
  const Quote = sequelize.define(
    "Quote",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      reference: { type: DataTypes.STRING(24), allowNull: false, unique: true },
      assetId: { type: DataTypes.UUID, allowNull: false },
      buyerId: { type: DataTypes.UUID },
      /** Responsavel RED pelo atendimento (painel, secao 10). */
      assignedTo: { type: DataTypes.UUID },

      buyerName: { type: DataTypes.STRING(160), allowNull: false },
      buyerEmail: { type: DataTypes.STRING(180), allowNull: false },
      buyerPhone: { type: DataTypes.STRING(40) },
      company: { type: DataTypes.STRING(160) },

      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      message: { type: DataTypes.TEXT },

      status: {
        type: DataTypes.ENUM(...Object.values(QUOTE_STATUS)),
        allowNull: false,
        defaultValue: QUOTE_STATUS.ABERTA,
      },
      quotedPrice: { type: DataTypes.DECIMAL(12, 2) },
      responseNotes: { type: DataTypes.TEXT },
      respondedAt: { type: DataTypes.DATE },
      closedAt: { type: DataTypes.DATE },
    },
    { tableName: "quotes", underscored: true, indexes: [{ fields: ["status"] }] }
  );

  Quote.associate = (models) => {
    Quote.belongsTo(models.Asset, { as: "ativo", foreignKey: "assetId" });
    Quote.belongsTo(models.User, { as: "comprador", foreignKey: "buyerId" });
    Quote.belongsTo(models.User, { as: "responsavel", foreignKey: "assignedTo" });
  };

  return Quote;
};
