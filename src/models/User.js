"use strict";

const { DataTypes } = require("sequelize");
const { ROLES, USER_STATUS } = require("../config/constants");

module.exports = (sequelize) => {
  const User = sequelize.define(
    "User",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(160), allowNull: false },
      email: {
        type: DataTypes.STRING(180),
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      passwordHash: { type: DataTypes.STRING(200), allowNull: false },
      role: {
        type: DataTypes.ENUM(...Object.values(ROLES)),
        allowNull: false,
        defaultValue: ROLES.COMPRADOR,
      },
      status: {
        type: DataTypes.ENUM(...Object.values(USER_STATUS)),
        allowNull: false,
        defaultValue: USER_STATUS.ATIVO,
      },
      phone: { type: DataTypes.STRING(40) },
      lastName: { type: DataTypes.STRING(120) },

      /** Bloco Empresa da Minha Conta. A captacao da RED e prioritariamente
       *  profissional, entao estes campos nao sao acessorios. */
      companyLegalName: { type: DataTypes.STRING(200) },
      companyTradeName: { type: DataTypes.STRING(200) },
      companyDocument: { type: DataTypes.STRING(30) },
      companyRole: { type: DataTypes.STRING(120) },
      companyEmail: { type: DataTypes.STRING(180) },

      company: { type: DataTypes.STRING(160) },
      document: { type: DataTypes.STRING(32) },
      city: { type: DataTypes.STRING(120) },
      state: { type: DataTypes.STRING(2) },
      lastLoginAt: { type: DataTypes.DATE },
    },
    {
      tableName: "users",
      underscored: true,
      paranoid: true,
      defaultScope: { attributes: { exclude: ["passwordHash"] } },
      scopes: { comSenha: { attributes: { include: ["passwordHash"] } } },
    }
  );

  User.associate = (models) => {
    User.hasMany(models.Address, { as: "enderecos", foreignKey: "userId", onDelete: "CASCADE" });
    User.hasMany(models.Asset, { as: "ativos", foreignKey: "supplierId" });
    User.hasMany(models.Submission, { as: "envios", foreignKey: "supplierId" });
    User.hasMany(models.Order, { as: "pedidos", foreignKey: "buyerId" });
    User.hasMany(models.Quote, { as: "cotacoes", foreignKey: "buyerId" });
  };

  return User;
};
