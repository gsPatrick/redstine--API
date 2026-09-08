"use strict";

const { DataTypes } = require("sequelize");
const { SUBMISSION_STATUS } = require("../config/constants");

module.exports = (sequelize) => {
  /**
   * Envio de ativos para avaliacao (formulario da pagina Vender).
   * Regra do negocio: o envio NAO garante publicacao. A submission e a porta de
   * entrada; quem decide e a curadoria, registrada em Evaluation.
   */
  const Submission = sequelize.define(
    "Submission",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      reference: { type: DataTypes.STRING(24), allowNull: false, unique: true },

      // Pode chegar sem cadastro — e um lead. Se houver conta, fica vinculado.
      supplierId: { type: DataTypes.UUID },

      name: { type: DataTypes.STRING(160), allowNull: false },
      company: { type: DataTypes.STRING(160) },
      email: { type: DataTypes.STRING(180), allowNull: false, validate: { isEmail: true } },
      phone: { type: DataTypes.STRING(40), allowNull: false },
      city: { type: DataTypes.STRING(160) },

      assetType: { type: DataTypes.STRING(120) },
      description: { type: DataTypes.TEXT, allowNull: false },
      approximateQuantity: { type: DataTypes.STRING(80) },
      notes: { type: DataTypes.TEXT },
      photos: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },

      /** Declaracao de autorizacao sobre os ativos — obrigatoria no formulario. */
      /** Dados do formulario do painel: categoria, condicao, quantidade,
       *  unidade e localizacao. Viram colunas proprias no Asset quando a
       *  curadoria aprova. */
      attributes: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },

      authorized: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      status: {
        type: DataTypes.ENUM(...Object.values(SUBMISSION_STATUS)),
        allowNull: false,
        defaultValue: SUBMISSION_STATUS.RECEBIDA,
      },
    },
    { tableName: "submissions", underscored: true, indexes: [{ fields: ["status"] }] }
  );

  Submission.associate = (models) => {
    Submission.belongsTo(models.User, { as: "fornecedor", foreignKey: "supplierId" });
    Submission.hasMany(models.Evaluation, {
      as: "avaliacoes",
      foreignKey: "submissionId",
      onDelete: "CASCADE",
    });
  };

  return Submission;
};
