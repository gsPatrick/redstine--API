"use strict";

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  /**
   * Pedido de recuperacao de senha.
   *
   * Guarda o HASH do token, nunca o token em claro: quem ler a base nao
   * consegue assumir a conta de ninguem. O valor original vai apenas no e-mail.
   */
  const PasswordReset = sequelize.define(
    "PasswordReset",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      tokenHash: { type: DataTypes.STRING(128), allowNull: false },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      usedAt: { type: DataTypes.DATE },
      requestedIp: { type: DataTypes.STRING(64) },
    },
    {
      tableName: "password_resets",
      underscored: true,
      indexes: [{ fields: ["token_hash"] }, { fields: ["user_id"] }],
    }
  );

  PasswordReset.associate = (models) => {
    PasswordReset.belongsTo(models.User, { as: "utilizador", foreignKey: "userId" });
  };

  return PasswordReset;
};
