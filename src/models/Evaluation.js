"use strict";

const { DataTypes } = require("sequelize");
const { MODELOS_COMERCIAIS } = require("../config/constants");

module.exports = (sequelize) => {
  /**
   * Registro da curadoria sobre um envio. E o documento que sustenta a frase
   * "cada ativo e avaliado antes de integrar o catalogo": sem Evaluation
   * aprovada nao se cria Asset a partir de uma Submission.
   */
  const Evaluation = sequelize.define(
    "Evaluation",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      submissionId: { type: DataTypes.UUID, allowNull: false },
      curatorId: { type: DataTypes.UUID, allowNull: false },

      // Criterios que a RED declara analisar.
      conditionNotes: { type: DataTypes.TEXT },
      quantityNotes: { type: DataTypes.TEXT },
      provenanceNotes: { type: DataTypes.TEXT },
      logisticsNotes: { type: DataTypes.TEXT },
      commercialNotes: { type: DataTypes.TEXT },

      recommendedPrice: { type: DataTypes.DECIMAL(12, 2) },
      recommendedMarketPrice: { type: DataTypes.DECIMAL(12, 2) },
      recommendedModel: { type: DataTypes.ENUM(...Object.values(MODELOS_COMERCIAIS)) },

      approved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      decisionReason: { type: DataTypes.TEXT },
      decidedAt: { type: DataTypes.DATE },

      /** Ativo gerado quando a avaliacao termina aprovada. */
      assetId: { type: DataTypes.UUID },
    },
    { tableName: "evaluations", underscored: true }
  );

  Evaluation.associate = (models) => {
    Evaluation.belongsTo(models.Submission, { as: "envio", foreignKey: "submissionId" });
    Evaluation.belongsTo(models.User, { as: "curador", foreignKey: "curatorId" });
    Evaluation.belongsTo(models.Asset, { as: "ativo", foreignKey: "assetId" });
  };

  return Evaluation;
};
