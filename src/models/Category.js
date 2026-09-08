"use strict";

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Category = sequelize.define(
    "Category",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      description: { type: DataTypes.TEXT },
      position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: "categories", underscored: true }
  );

  Category.associate = (models) => {
    Category.hasMany(models.Subcategory, { as: "subcategorias", foreignKey: "categoryId" });
    Category.hasMany(models.Asset, { as: "ativos", foreignKey: "categoryId" });
  };

  return Category;
};
