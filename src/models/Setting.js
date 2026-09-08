"use strict";

const { DataTypes } = require("sequelize");

/**
 * Configuracao da plataforma, em chave/valor JSONB.
 *
 * Os percentuais padrao e o prazo de repasse nasceram no .env, mas o painel
 * precisa edita-los sem redeploy. O .env continua sendo o fallback: se a chave
 * nao existir aqui, o service cai no valor de ambiente — assim a plataforma
 * sobe mesmo com a tabela vazia.
 */
module.exports = (sequelize) => {
  const Setting = sequelize.define(
    "Setting",
    {
      key: { type: DataTypes.STRING(80), primaryKey: true },
      value: { type: DataTypes.JSONB, allowNull: false },
      description: { type: DataTypes.STRING(300) },
      updatedBy: { type: DataTypes.UUID },
    },
    { tableName: "settings", underscored: true }
  );

  Setting.associate = (models) => {
    Setting.belongsTo(models.User, { as: "autor", foreignKey: "updatedBy" });
  };

  return Setting;
};
