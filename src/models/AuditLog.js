"use strict";

const { DataTypes } = require("sequelize");
const { ENTIDADES_AUDITAVEIS } = require("../config/constants");

module.exports = (sequelize) => {
  /**
   * Rastreabilidade (documento oficial, secao 23).
   *
   * A regra pede historico de cadastro, avaliacao, aprovacao, publicacao,
   * preco, quantidade, modelo, status, consulta, venda, custo, retirada,
   * conclusao e repasse. E cada evento precisa registrar:
   *   data/hora · usuario · ativo/venda · acao · estado anterior · novo estado
   *
   * E o que responde "quem mudou este preco, e para quanto" seis meses depois.
   * Append-only.
   */
  const AuditLog = sequelize.define(
    "AuditLog",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

      entity: { type: DataTypes.ENUM(...ENTIDADES_AUDITAVEIS), allowNull: false },
      entityId: { type: DataTypes.UUID, allowNull: false },
      action: { type: DataTypes.STRING(60), allowNull: false },

      // Quem agiu. Nulo quando a acao veio do proprio sistema.
      actorId: { type: DataTypes.UUID },
      actorRole: { type: DataTypes.STRING(30) },

      // Estado anterior e novo, campo a campo — so o que mudou.
      before: { type: DataTypes.JSONB },
      after: { type: DataTypes.JSONB },

      notes: { type: DataTypes.TEXT },
      occurredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: "audit_logs",
      underscored: true,
      updatedAt: false,
      indexes: [{ fields: ["entity", "entity_id", "occurred_at"] }, { fields: ["actor_id"] }],
    }
  );

  AuditLog.associate = (models) => {
    AuditLog.belongsTo(models.User, { as: "autor", foreignKey: "actorId" });
  };

  return AuditLog;
};
