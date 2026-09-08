"use strict";

/**
 * Rastreamento desde a V1 (documento oficial, seções 23 e 24).
 *
 * O princípio do briefing: "A V1 deve mostrar pouco, mas registrar muito.
 * O banco e o rastreamento precisam nascer mais completos porque não podemos
 * voltar no tempo para coletar dados que decidimos ignorar no lançamento."
 *
 * Inclui também:
 *  - quantidade original vs disponível no ativo
 *  - responsável pela consulta (painel, seção 10)
 *  - vocabulário oficial dos status de consulta
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;
    const q = (sql, t) => queryInterface.sequelize.query(sql, t ? { transaction: t } : undefined);

    const base = (Seq) => ({
      id: {
        type: DataTypes.UUID,
        defaultValue: Seq.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Seq.fn("NOW") },
    });

    // ---------- events ----------
    await queryInterface.createTable("events", {
      ...base(Sequelize),
      type: {
        type: DataTypes.ENUM(
          "product_view",
          "favorite_added",
          "favorite_removed",
          "consultation_created",
          "consultation_answered",
          "purchase_completed",
          "asset_published",
          "asset_sold",
          "operation_completed",
          "payment_completed"
        ),
        allowNull: false,
      },
      user_id: {
        type: DataTypes.UUID,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      asset_id: {
        type: DataTypes.UUID,
        references: { model: "assets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      order_id: { type: DataTypes.UUID },
      quote_id: { type: DataTypes.UUID },
      payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      session_id: DataTypes.STRING(64),
      ip: DataTypes.STRING(64),
      user_agent: DataTypes.STRING(300),
      occurred_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.addIndex("events", ["type", "occurred_at"]);
    await queryInterface.addIndex("events", ["asset_id"]);
    await queryInterface.addIndex("events", ["user_id"]);

    // ---------- audit_logs ----------
    await queryInterface.createTable("audit_logs", {
      ...base(Sequelize),
      entity: {
        type: DataTypes.ENUM(
          "asset",
          "submission",
          "evaluation",
          "order",
          "quote",
          "cost",
          "payout",
          "user"
        ),
        allowNull: false,
      },
      entity_id: { type: DataTypes.UUID, allowNull: false },
      action: { type: DataTypes.STRING(60), allowNull: false },
      actor_id: {
        type: DataTypes.UUID,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      actor_role: DataTypes.STRING(30),
      before: DataTypes.JSONB,
      after: DataTypes.JSONB,
      notes: DataTypes.TEXT,
      occurred_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });
    await queryInterface.addIndex("audit_logs", ["entity", "entity_id", "occurred_at"]);
    await queryInterface.addIndex("audit_logs", ["actor_id"]);

    // ---------- notifications ----------
    await queryInterface.createTable("notifications", {
      ...base(Sequelize),
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      type: {
        type: DataTypes.ENUM(
          "consulta_respondida",
          "compra_confirmada",
          "compra_pronta_retirada",
          "ativo_aguardando_aprovacao",
          "ativo_publicado",
          "ativo_vendido",
          "valor_a_receber",
          "pagamento_realizado",
          "nova_consulta",
          "novo_envio",
          "venda_realizada",
          "repasse_pendente"
        ),
        allowNull: false,
      },
      title: { type: DataTypes.STRING(200), allowNull: false },
      body: DataTypes.TEXT,
      link: DataTypes.STRING(300),
      entity: DataTypes.STRING(30),
      entity_id: DataTypes.UUID,
      read_at: DataTypes.DATE,
      emailed_at: DataTypes.DATE,
    });
    await queryInterface.addIndex("notifications", ["user_id", "read_at"]);
    await queryInterface.addIndex("notifications", ["user_id", "created_at"]);

    // ---------- ativo: quantidade original ----------
    // O documento pergunta a diferença entre original e disponível. A resposta
    // é que sem a original não há como saber quanto já foi vendido depois de
    // vendas parciais — a disponível sozinha perde essa informação.
    await queryInterface.addColumn("assets", "original_quantity", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });
    await queryInterface.sequelize.query(
      `UPDATE "assets" SET "original_quantity" = GREATEST("quantity", 1);`
    );

    // Quem aprovou o preço — a regra pede usuário responsável pela aprovação.
    await queryInterface.addColumn("assets", "supplier_approved_by", {
      type: DataTypes.UUID,
      references: { model: "users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    // ---------- consulta: responsável e vocabulário oficial ----------
    await queryInterface.addColumn("quotes", "assigned_to", {
      type: DataTypes.UUID,
      references: { model: "users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    await q(`ALTER TABLE "quotes" ALTER COLUMN "status" DROP DEFAULT;`);
    await q(`ALTER TABLE "quotes" ALTER COLUMN "status" TYPE text;`);
    await q(`DROP TYPE IF EXISTS "enum_quotes_status";`);
    await q(
      `CREATE TYPE "enum_quotes_status" AS ENUM ('nova','em_atendimento','respondida','encerrada');`
    );
    await q(`UPDATE "quotes" SET "status" = 'nova' WHERE "status" = 'aberta';`);
    await q(`UPDATE "quotes" SET "status" = 'em_atendimento' WHERE "status" = 'em_analise';`);
    await q(
      `UPDATE "quotes" SET "status" = 'encerrada' WHERE "status" IN ('aceita','recusada','fechada');`
    );
    await q(
      `ALTER TABLE "quotes" ALTER COLUMN "status" TYPE "enum_quotes_status" USING "status"::"enum_quotes_status";`
    );
    await q(`ALTER TABLE "quotes" ALTER COLUMN "status" SET DEFAULT 'nova';`);
  },

  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);

    await queryInterface.dropTable("notifications");
    await queryInterface.dropTable("audit_logs");
    await queryInterface.dropTable("events");

    for (const type of [
      "enum_notifications_type",
      "enum_audit_logs_entity",
      "enum_events_type",
    ]) {
      await q(`DROP TYPE IF EXISTS "${type}";`);
    }

    await queryInterface.removeColumn("assets", "original_quantity");
    await queryInterface.removeColumn("assets", "supplier_approved_by");
    await queryInterface.removeColumn("quotes", "assigned_to");

    await q(`ALTER TABLE "quotes" ALTER COLUMN "status" DROP DEFAULT;`);
    await q(`ALTER TABLE "quotes" ALTER COLUMN "status" TYPE text;`);
    await q(`DROP TYPE IF EXISTS "enum_quotes_status";`);
    await q(
      `CREATE TYPE "enum_quotes_status" AS ENUM ('aberta','em_analise','respondida','aceita','recusada','fechada');`
    );
    await q(`UPDATE "quotes" SET "status" = 'aberta' WHERE "status" = 'nova';`);
    await q(`UPDATE "quotes" SET "status" = 'em_analise' WHERE "status" = 'em_atendimento';`);
    await q(`UPDATE "quotes" SET "status" = 'fechada' WHERE "status" = 'encerrada';`);
    await q(
      `ALTER TABLE "quotes" ALTER COLUMN "status" TYPE "enum_quotes_status" USING "status"::"enum_quotes_status";`
    );
    await q(`ALTER TABLE "quotes" ALTER COLUMN "status" SET DEFAULT 'aberta';`);
  },
};
