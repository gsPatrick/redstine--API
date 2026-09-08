"use strict";

/**
 * Acrescenta o que faltava para o painel do cliente sair do placeholder:
 * favoritos persistidos, repasse ao fornecedor e recuperacao de senha.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    const base = () => ({
      id: {
        type: DataTypes.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });

    // ---------- wishlists ----------
    await queryInterface.createTable("wishlists", {
      ...base(),
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      asset_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "assets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
    });
    await queryInterface.addIndex("wishlists", ["user_id", "asset_id"], {
      unique: true,
      name: "wishlists_user_asset_unique",
    });

    // ---------- payouts ----------
    await queryInterface.createTable("payouts", {
      ...base(),
      order_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "orders", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      order_item_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "order_items", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      asset_id: {
        type: DataTypes.UUID,
        references: { model: "assets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      supplier_id: {
        type: DataTypes.UUID,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      commercial_model: {
        type: DataTypes.ENUM("estoque", "catalogo"),
        allowNull: false,
      },
      supplier_percent: { type: DataTypes.INTEGER, allowNull: false },
      gross_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      supplier_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      red_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      status: {
        type: DataTypes.ENUM("pendente", "pago", "cancelado"),
        allowNull: false,
        defaultValue: "pendente",
      },
      paid_at: DataTypes.DATE,
      notes: DataTypes.TEXT,
    });
    await queryInterface.addIndex("payouts", ["supplier_id", "status"]);
    await queryInterface.addIndex("payouts", ["order_id"]);

    // Um item de pedido gera um unico repasse.
    await queryInterface.addIndex("payouts", ["order_item_id"], {
      unique: true,
      name: "payouts_order_item_unique",
    });

    // ---------- password_resets ----------
    await queryInterface.createTable("password_resets", {
      ...base(),
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      token_hash: { type: DataTypes.STRING(128), allowNull: false },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      used_at: DataTypes.DATE,
      requested_ip: DataTypes.STRING(64),
    });
    await queryInterface.addIndex("password_resets", ["token_hash"]);
    await queryInterface.addIndex("password_resets", ["user_id"]);
  },

  async down(queryInterface) {
    for (const tabela of ["password_resets", "payouts", "wishlists"]) {
      await queryInterface.dropTable(tabela);
    }
    for (const e of ["enum_payouts_commercial_model", "enum_payouts_status"]) {
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${e}";`);
    }
  },
};
