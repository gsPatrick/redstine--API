"use strict";

/**
 * Esquema inicial da RED.
 *
 * A ordem de criacao segue as dependencias de chave estrangeira:
 * users e categories primeiro, depois subcategories, assets e o resto.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    const base = () => ({
      id: { type: DataTypes.UUID, defaultValue: Sequelize.literal("gen_random_uuid()"), primaryKey: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });

    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

    // ---------- users ----------
    await queryInterface.createTable("users", {
      ...base(),
      name: { type: DataTypes.STRING(160), allowNull: false },
      email: { type: DataTypes.STRING(180), allowNull: false, unique: true },
      password_hash: { type: DataTypes.STRING(200), allowNull: false },
      role: {
        type: DataTypes.ENUM("admin", "curador", "fornecedor", "comprador"),
        allowNull: false,
        defaultValue: "comprador",
      },
      status: {
        type: DataTypes.ENUM("ativo", "inativo", "pendente"),
        allowNull: false,
        defaultValue: "ativo",
      },
      phone: DataTypes.STRING(40),
      company: DataTypes.STRING(160),
      document: DataTypes.STRING(32),
      city: DataTypes.STRING(120),
      state: DataTypes.STRING(2),
      last_login_at: DataTypes.DATE,
      deleted_at: DataTypes.DATE,
    });

    // ---------- categories ----------
    await queryInterface.createTable("categories", {
      ...base(),
      slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      description: DataTypes.TEXT,
      position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    });

    // ---------- subcategories ----------
    await queryInterface.createTable("subcategories", {
      ...base(),
      category_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "categories", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      slug: { type: DataTypes.STRING(140), allowNull: false },
      name: { type: DataTypes.STRING(140), allowNull: false },
      position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    });
    await queryInterface.addIndex("subcategories", ["category_id", "slug"], {
      unique: true,
      name: "subcategories_category_slug_unique",
    });

    // ---------- assets ----------
    await queryInterface.createTable("assets", {
      ...base(),
      sku: { type: DataTypes.STRING(60), unique: true },
      slug: { type: DataTypes.STRING(200), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(220), allowNull: false },
      short_description: DataTypes.TEXT,
      description: DataTypes.TEXT,

      supplier_id: {
        type: DataTypes.UUID,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      category_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "categories", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      subcategory_id: {
        type: DataTypes.UUID,
        references: { model: "subcategories", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      condition: DataTypes.ENUM("sem_uso", "seminovo", "usado"),
      location: DataTypes.STRING(140),
      brand: DataTypes.STRING(120),
      material: DataTypes.STRING(120),
      color: DataTypes.STRING(80),
      size: DataTypes.STRING(80),

      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      unit: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "unidade" },

      price: DataTypes.DECIMAL(12, 2),
      market_price: DataTypes.DECIMAL(12, 2),

      sale_mode: {
        type: DataTypes.ENUM("direta", "consulta"),
        allowNull: false,
        defaultValue: "direta",
      },
      commercial_model: {
        type: DataTypes.ENUM("estoque", "catalogo"),
        allowNull: false,
        defaultValue: "catalogo",
      },
      status: {
        type: DataTypes.ENUM(
          "rascunho",
          "em_curadoria",
          "aguardando_aprovacao",
          "aprovado",
          "publicado",
          "vendido",
          "arquivado"
        ),
        allowNull: false,
        defaultValue: "rascunho",
      },

      supplier_approved_at: DataTypes.DATE,
      published_at: DataTypes.DATE,
      sold_at: DataTypes.DATE,
      featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      attributes: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      deleted_at: DataTypes.DATE,
    });

    for (const campo of ["status", "category_id", "subcategory_id", "supplier_id", "featured"]) {
      await queryInterface.addIndex("assets", [campo]);
    }

    // ---------- asset_images ----------
    await queryInterface.createTable("asset_images", {
      ...base(),
      asset_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "assets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      url: { type: DataTypes.STRING(500), allowNull: false },
      alt: DataTypes.STRING(220),
      position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    });
    await queryInterface.addIndex("asset_images", ["asset_id", "position"]);

    // ---------- submissions ----------
    await queryInterface.createTable("submissions", {
      ...base(),
      reference: { type: DataTypes.STRING(24), allowNull: false, unique: true },
      supplier_id: {
        type: DataTypes.UUID,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      name: { type: DataTypes.STRING(160), allowNull: false },
      company: DataTypes.STRING(160),
      email: { type: DataTypes.STRING(180), allowNull: false },
      phone: { type: DataTypes.STRING(40), allowNull: false },
      city: DataTypes.STRING(160),
      asset_type: DataTypes.STRING(120),
      description: { type: DataTypes.TEXT, allowNull: false },
      approximate_quantity: DataTypes.STRING(80),
      notes: DataTypes.TEXT,
      photos: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      authorized: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      status: {
        type: DataTypes.ENUM("recebida", "em_avaliacao", "aprovada", "recusada"),
        allowNull: false,
        defaultValue: "recebida",
      },
    });
    await queryInterface.addIndex("submissions", ["status"]);

    // ---------- evaluations ----------
    await queryInterface.createTable("evaluations", {
      ...base(),
      submission_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "submissions", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      curator_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      asset_id: {
        type: DataTypes.UUID,
        references: { model: "assets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      condition_notes: DataTypes.TEXT,
      quantity_notes: DataTypes.TEXT,
      provenance_notes: DataTypes.TEXT,
      logistics_notes: DataTypes.TEXT,
      commercial_notes: DataTypes.TEXT,
      recommended_price: DataTypes.DECIMAL(12, 2),
      recommended_market_price: DataTypes.DECIMAL(12, 2),
      recommended_model: DataTypes.ENUM("estoque", "catalogo"),
      approved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      decision_reason: DataTypes.TEXT,
      decided_at: DataTypes.DATE,
    });

    // ---------- orders ----------
    await queryInterface.createTable("orders", {
      ...base(),
      reference: { type: DataTypes.STRING(24), allowNull: false, unique: true },
      buyer_id: {
        type: DataTypes.UUID,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      buyer_name: { type: DataTypes.STRING(160), allowNull: false },
      buyer_email: { type: DataTypes.STRING(180), allowNull: false },
      buyer_phone: DataTypes.STRING(40),
      buyer_document: DataTypes.STRING(32),
      billing: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      status: {
        type: DataTypes.ENUM(
          "aguardando_confirmacao",
          "confirmado",
          "em_separacao",
          "aguardando_retirada",
          "concluido",
          "cancelado"
        ),
        allowNull: false,
        defaultValue: "aguardando_confirmacao",
      },
      payment_method: {
        type: DataTypes.ENUM("pix", "boleto", "consulta"),
        allowNull: false,
        defaultValue: "pix",
      },
      subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      total: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      pickup_notes: DataTypes.TEXT,
      notes: DataTypes.TEXT,
      confirmed_at: DataTypes.DATE,
      concluded_at: DataTypes.DATE,
      canceled_at: DataTypes.DATE,
      cancel_reason: DataTypes.TEXT,
    });
    await queryInterface.addIndex("orders", ["status"]);

    // ---------- order_items ----------
    await queryInterface.createTable("order_items", {
      ...base(),
      order_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "orders", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      asset_id: {
        type: DataTypes.UUID,
        references: { model: "assets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      name_snapshot: { type: DataTypes.STRING(220), allowNull: false },
      unit_price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      market_price_snapshot: DataTypes.DECIMAL(12, 2),
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      total: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    });

    // ---------- quotes ----------
    await queryInterface.createTable("quotes", {
      ...base(),
      reference: { type: DataTypes.STRING(24), allowNull: false, unique: true },
      asset_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "assets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      buyer_id: {
        type: DataTypes.UUID,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      buyer_name: { type: DataTypes.STRING(160), allowNull: false },
      buyer_email: { type: DataTypes.STRING(180), allowNull: false },
      buyer_phone: DataTypes.STRING(40),
      company: DataTypes.STRING(160),
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      message: DataTypes.TEXT,
      status: {
        type: DataTypes.ENUM("aberta", "em_analise", "respondida", "aceita", "recusada", "fechada"),
        allowNull: false,
        defaultValue: "aberta",
      },
      quoted_price: DataTypes.DECIMAL(12, 2),
      response_notes: DataTypes.TEXT,
      responded_at: DataTypes.DATE,
      closed_at: DataTypes.DATE,
    });
    await queryInterface.addIndex("quotes", ["status"]);
  },

  async down(queryInterface) {
    // Ordem inversa das dependencias.
    for (const tabela of [
      "quotes",
      "order_items",
      "orders",
      "evaluations",
      "submissions",
      "asset_images",
      "assets",
      "subcategories",
      "categories",
      "users",
    ]) {
      await queryInterface.dropTable(tabela);
    }

    const enums = [
      "enum_users_role",
      "enum_users_status",
      "enum_assets_condition",
      "enum_assets_sale_mode",
      "enum_assets_commercial_model",
      "enum_assets_status",
      "enum_submissions_status",
      "enum_evaluations_recommended_model",
      "enum_orders_status",
      "enum_orders_payment_method",
      "enum_quotes_status",
    ];
    for (const e of enums) {
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${e}";`);
    }
  },
};
