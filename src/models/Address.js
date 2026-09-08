"use strict";

const { DataTypes } = require("sequelize");

/**
 * Endereco do utilizador.
 *
 * Dois tipos, e so um de cada por utilizador (indice unico no banco): retirada
 * e cobranca servem a operacoes diferentes — um define para onde o comprador
 * vai buscar o ativo, o outro vai na nota. Um campo unico obrigaria a escolher
 * qual dos dois ficaria errado.
 */
module.exports = (sequelize) => {
  const Address = sequelize.define(
    "Address",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      type: { type: DataTypes.ENUM("retirada", "cobranca"), allowNull: false },
      zip: { type: DataTypes.STRING(12) },
      street: { type: DataTypes.STRING(200) },
      number: { type: DataTypes.STRING(20) },
      complement: { type: DataTypes.STRING(120) },
      district: { type: DataTypes.STRING(120) },
      city: { type: DataTypes.STRING(120) },
      state: { type: DataTypes.STRING(2) },
    },
    {
      tableName: "addresses",
      underscored: true,
      indexes: [{ fields: ["user_id", "type"], unique: true }],
    }
  );

  Address.associate = (models) => {
    Address.belongsTo(models.User, { as: "utilizador", foreignKey: "userId" });
  };

  return Address;
};
