"use strict";

/**
 * Campos que os dois paineis exigem e que o esquema ainda nao tinha.
 *
 * A regra desta migracao: o front e a especificacao. Cada coluna aqui existe
 * porque uma tela concreta a le — nao ha campo especulativo.
 *
 *  - retirada estruturada      Detalhe da Compra mostra local, endereco,
 *                              responsavel, contato, agendamento e instrucoes.
 *                              Antes existia so um `pickup_notes` livre, que
 *                              nao da para renderizar em campos separados.
 *  - meio do repasse           Historico de pagamentos do fornecedor mostra
 *                              "PIX" / "Transferencia" ao lado do comprovante.
 *  - identidade do utilizador  Dados Cadastrais separa Nome e Sobrenome; a
 *                              aba Empresa pede razao social, fantasia, CNPJ,
 *                              cargo e e-mail corporativo.
 *  - enderecos                 Retirada e cobranca sao endereços distintos e
 *                              servem a operacoes distintas: um define para
 *                              onde o comprador vai, o outro vai na nota.
 *  - configuracoes             Percentuais padrao e prazos deixam de estar so
 *                              no .env para poderem ser editados no painel.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    // ---------- retirada estruturada ----------
    for (const [coluna, tipo] of [
      ["pickup_location", DataTypes.STRING(160)],
      ["pickup_address", DataTypes.STRING(300)],
      ["pickup_contact_name", DataTypes.STRING(140)],
      ["pickup_contact_phone", DataTypes.STRING(40)],
      ["pickup_instructions", DataTypes.TEXT],
    ]) {
      await queryInterface.addColumn("orders", coluna, { type: tipo });
    }
    await queryInterface.addColumn("orders", "pickup_scheduled_at", { type: DataTypes.DATE });

    // ---------- meio do repasse ----------
    await queryInterface.addColumn("payouts", "payment_method", { type: DataTypes.STRING(40) });

    // ---------- identidade e empresa ----------
    for (const [coluna, tipo] of [
      ["last_name", DataTypes.STRING(120)],
      ["company_legal_name", DataTypes.STRING(200)],
      ["company_trade_name", DataTypes.STRING(200)],
      ["company_document", DataTypes.STRING(30)],
      ["company_role", DataTypes.STRING(120)],
      ["company_email", DataTypes.STRING(180)],
    ]) {
      await queryInterface.addColumn("users", coluna, { type: tipo });
    }

    // ---------- enderecos ----------
    await queryInterface.createTable("addresses", {
      id: {
        type: DataTypes.UUID,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      // Um utilizador tem no maximo um de cada tipo — o indice unico abaixo
      // garante isso no banco, nao so no service.
      type: { type: DataTypes.ENUM("retirada", "cobranca"), allowNull: false },
      zip: DataTypes.STRING(12),
      street: DataTypes.STRING(200),
      number: DataTypes.STRING(20),
      complement: DataTypes.STRING(120),
      district: DataTypes.STRING(120),
      city: DataTypes.STRING(120),
      state: DataTypes.STRING(2),
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.addIndex("addresses", ["user_id", "type"], { unique: true });

    // ---------- configuracoes ----------
    await queryInterface.createTable("settings", {
      key: { type: DataTypes.STRING(80), primaryKey: true },
      value: { type: DataTypes.JSONB, allowNull: false },
      description: DataTypes.STRING(300),
      updated_by: {
        type: DataTypes.UUID,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("settings");
    await queryInterface.dropTable("addresses");
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_addresses_type";`);

    for (const c of [
      "pickup_location",
      "pickup_address",
      "pickup_contact_name",
      "pickup_contact_phone",
      "pickup_instructions",
      "pickup_scheduled_at",
    ]) {
      await queryInterface.removeColumn("orders", c);
    }
    await queryInterface.removeColumn("payouts", "payment_method");
    for (const c of [
      "last_name",
      "company_legal_name",
      "company_trade_name",
      "company_document",
      "company_role",
      "company_email",
    ]) {
      await queryInterface.removeColumn("users", c);
    }
  },
};
