"use strict";

const { DataTypes } = require("sequelize");
const {
  CONDICOES,
  ASSET_STATUS,
  MODELOS_COMERCIAIS,
  MODALIDADES,
} = require("../config/constants");

module.exports = (sequelize) => {
  const Asset = sequelize.define(
    "Asset",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      sku: { type: DataTypes.STRING(60), unique: true },
      slug: { type: DataTypes.STRING(200), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(220), allowNull: false },
      shortDescription: { type: DataTypes.TEXT },
      description: { type: DataTypes.TEXT },

      supplierId: { type: DataTypes.UUID, allowNull: true },
      categoryId: { type: DataTypes.UUID, allowNull: false },
      subcategoryId: { type: DataTypes.UUID },

      condition: { type: DataTypes.ENUM(...CONDICOES) },
      location: { type: DataTypes.STRING(140) },
      brand: { type: DataTypes.STRING(120) },
      material: { type: DataTypes.STRING(120) },
      color: { type: DataTypes.STRING(80) },
      size: { type: DataTypes.STRING(80) },

      /**
       * Original x disponivel: sem a original nao ha como saber quanto ja foi
       * vendido depois de vendas parciais — a disponivel sozinha perde essa
       * informacao no momento em que baixa.
       */
      originalQuantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      unit: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "unidade" },

      /**
       * price  = valor praticado pela RED.
       * marketPrice = referencia de mercado. E este par que sustenta a promessa
       * publica de "ate 50% do preco de mercado" — sem marketPrice nao existe
       * desconto verificavel, so alegacao.
       */
      price: { type: DataTypes.DECIMAL(12, 2) },
      marketPrice: { type: DataTypes.DECIMAL(12, 2) },

      /** Como o ativo é vendido — unidade, conjunto ou lote. */
      saleFormat: {
        type: DataTypes.ENUM("unidade", "conjunto", "lote"),
        allowNull: false,
        defaultValue: "unidade",
      },

      /** Disponibilidade operacional, independente do status de publicação. */
      availability: {
        type: DataTypes.ENUM("disponivel", "sujeito_confirmacao", "reservado"),
        allowNull: false,
        defaultValue: "disponivel",
      },

      saleMode: {
        type: DataTypes.ENUM(...Object.values(MODALIDADES)),
        allowNull: false,
        defaultValue: MODALIDADES.DIRETA,
      },
      commercialModel: {
        type: DataTypes.ENUM(...Object.values(MODELOS_COMERCIAIS)),
        allowNull: false,
        defaultValue: MODELOS_COMERCIAIS.CATALOGO,
      },

      status: {
        type: DataTypes.ENUM(...Object.values(ASSET_STATUS)),
        allowNull: false,
        defaultValue: ASSET_STATUS.RASCUNHO,
      },

      /**
       * Marca que o fornecedor aprovou preco e modelo. A regra do negocio e que
       * "nenhum ativo e comercializado por preco nao autorizado" — o service de
       * publicacao exige este carimbo.
       */
      supplierApprovedAt: { type: DataTypes.DATE },
      supplierApprovedBy: { type: DataTypes.UUID },
      publishedAt: { type: DataTypes.DATE },
      soldAt: { type: DataTypes.DATE },

      featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      attributes: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    },
    {
      tableName: "assets",
      underscored: true,
      paranoid: true,
      indexes: [
        { fields: ["status"] },
        { fields: ["category_id"] },
        { fields: ["subcategory_id"] },
        { fields: ["supplier_id"] },
        { fields: ["featured"] },
      ],
      scopes: {
        // Tudo que e publico passa por aqui: o catalogo nunca expoe rascunho
        // nem item em curadoria.
        publicos: { where: { status: ASSET_STATUS.PUBLICADO } },
      },
    }
  );

  /** Percentual de desconto sobre a referencia de mercado, quando houver. */
  Asset.prototype.descontoPercentual = function descontoPercentual() {
    const preco = Number(this.price);
    const mercado = Number(this.marketPrice);
    if (!Number.isFinite(preco) || !Number.isFinite(mercado) || mercado <= 0) return null;
    if (preco >= mercado) return 0;
    return Math.round((1 - preco / mercado) * 100);
  };

  Asset.associate = (models) => {
    Asset.belongsTo(models.User, { as: "fornecedor", foreignKey: "supplierId" });
    Asset.belongsTo(models.Category, { as: "categoria", foreignKey: "categoryId" });
    Asset.belongsTo(models.Subcategory, { as: "subcategoria", foreignKey: "subcategoryId" });
    Asset.hasMany(models.AssetImage, {
      as: "imagens",
      foreignKey: "assetId",
      onDelete: "CASCADE",
    });
    Asset.hasMany(models.Quote, { as: "cotacoes", foreignKey: "assetId" });
    Asset.hasMany(models.OrderItem, { as: "itensPedido", foreignKey: "assetId" });
  };

  return Asset;
};
