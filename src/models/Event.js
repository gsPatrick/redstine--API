"use strict";

const { DataTypes } = require("sequelize");
const { EVENTOS } = require("../config/constants");

module.exports = (sequelize) => {
  /**
   * Evento de analytics (documento oficial, secao 24).
   *
   * A V1 nao exibe analytics, mas coleta desde o primeiro dia — "nao podemos
   * voltar no tempo para coletar dados que decidimos ignorar no lancamento".
   *
   * Tabela append-only: nada aqui e atualizado ou apagado.
   */
  const Event = sequelize.define(
    "Event",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      type: { type: DataTypes.ENUM(...Object.values(EVENTOS)), allowNull: false },

      // Quem — nulo quando o visitante nao esta autenticado.
      userId: { type: DataTypes.UUID },
      // Sobre o que.
      assetId: { type: DataTypes.UUID },
      orderId: { type: DataTypes.UUID },
      quoteId: { type: DataTypes.UUID },

      // Contexto livre: categoria, valor, origem do trafego, o que for util
      // depois sem exigir migration agora.
      payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },

      sessionId: { type: DataTypes.STRING(64) },
      ip: { type: DataTypes.STRING(64) },
      userAgent: { type: DataTypes.STRING(300) },

      occurredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "events",
      underscored: true,
      updatedAt: false,
      indexes: [
        { fields: ["type", "occurred_at"] },
        { fields: ["asset_id"] },
        { fields: ["user_id"] },
      ],
    }
  );

  Event.associate = (models) => {
    Event.belongsTo(models.User, { as: "utilizador", foreignKey: "userId" });
    Event.belongsTo(models.Asset, { as: "ativo", foreignKey: "assetId" });
  };

  return Event;
};
