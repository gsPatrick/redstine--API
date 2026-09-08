"use strict";

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  /**
   * Favoritos por utilizador. Existe para a lista sobreviver a troca de
   * navegador — antes vivia apenas no localStorage do site.
   */
  const Wishlist = sequelize.define(
    "Wishlist",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      assetId: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: "wishlists",
      underscored: true,
      indexes: [{ unique: true, fields: ["user_id", "asset_id"] }],
    }
  );

  Wishlist.associate = (models) => {
    Wishlist.belongsTo(models.User, { as: "utilizador", foreignKey: "userId" });
    Wishlist.belongsTo(models.Asset, { as: "ativo", foreignKey: "assetId" });
  };

  return Wishlist;
};
