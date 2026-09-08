"use strict";

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Subcategory = sequelize.define(
    "Subcategory",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      categoryId: { type: DataTypes.UUID, allowNull: false },
      slug: { type: DataTypes.STRING(140), allowNull: false },
      name: { type: DataTypes.STRING(140), allowNull: false },
      position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: "subcategories",
      underscored: true,
      indexes: [{ unique: true, fields: ["category_id", "slug"] }],
    }
  );

  Subcategory.associate = (models) => {
    Subcategory.belongsTo(models.Category, { as: "categoria", foreignKey: "categoryId" });
    Subcategory.hasMany(models.Asset, { as: "ativos", foreignKey: "subcategoryId" });
  };

  return Subcategory;
};
