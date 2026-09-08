"use strict";

const { DataTypes } = require("sequelize");
const { NOTIFICACOES } = require("../config/constants");

module.exports = (sequelize) => {
  /**
   * Notificacao do sino (area do cliente e painel de gestao).
   *
   * O documento e claro sobre o lugar dela: "o sino fica como um elemento
   * global no cabecalho, disponivel em qualquer tela" — nao e item de menu.
   *
   * `link` existe porque a regra pede que a notificacao leve direto ao objeto:
   * "Compra disponivel para retirada" abre aquela compra.
   */
  const Notification = sequelize.define(
    "Notification",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      type: { type: DataTypes.ENUM(...Object.values(NOTIFICACOES)), allowNull: false },

      title: { type: DataTypes.STRING(200), allowNull: false },
      body: { type: DataTypes.TEXT },
      link: { type: DataTypes.STRING(300) },

      // Objeto referenciado, para o front resolver o destino se preferir.
      entity: { type: DataTypes.STRING(30) },
      entityId: { type: DataTypes.UUID },

      readAt: { type: DataTypes.DATE },
      emailedAt: { type: DataTypes.DATE },
    },
    {
      tableName: "notifications",
      underscored: true,
      indexes: [{ fields: ["user_id", "read_at"] }, { fields: ["user_id", "created_at"] }],
    }
  );

  Notification.associate = (models) => {
    Notification.belongsTo(models.User, { as: "destinatario", foreignKey: "userId" });
  };

  return Notification;
};
