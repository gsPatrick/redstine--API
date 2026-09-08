"use strict";

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const AssetImage = sequelize.define(
    "AssetImage",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      assetId: { type: DataTypes.UUID, allowNull: false },
      url: { type: DataTypes.STRING(500), allowNull: false },
      alt: { type: DataTypes.STRING(220) },
      position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: "asset_images",
      underscored: true,
      indexes: [{ fields: ["asset_id", "position"] }],
    }
  );

  AssetImage.associate = (models) => {
    AssetImage.belongsTo(models.Asset, { as: "ativo", foreignKey: "assetId" });
  };

  return AssetImage;
};
