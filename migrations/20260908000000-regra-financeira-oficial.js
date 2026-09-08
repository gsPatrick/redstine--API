"use strict";

/**
 * Alinha o financeiro ao documento oficial de regras de negócio V1.
 *
 * O que muda:
 *  - custos dedutíveis passam a existir como registros individuais
 *  - o split passa a incidir sobre o valor LÍQUIDO (bruto − custos aprovados)
 *  - o repasse ganha status financeiro próprio e prazo de 48h
 *  - o pedido rastreia pagamento, retirada e conclusão integral
 *  - novos papéis: comercial e financeiro
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    // ---------- papéis novos ----------
    // ALTER TYPE ... ADD VALUE precisa ficar fora da transação: o Postgres não
    // permite usar o valor novo no mesmo bloco em que ele é criado.
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'comercial';`
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'financeiro';`
    );

    const t = await queryInterface.sequelize.transaction();

    try {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction: t });

      // ---------- custos ----------
      await queryInterface.createTable(
        "costs",
        {
          id: {
            type: DataTypes.UUID,
            defaultValue: Sequelize.literal("gen_random_uuid()"),
            primaryKey: true,
          },
          order_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: "orders", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          order_item_id: {
            type: DataTypes.UUID,
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
          type: {
            type: DataTypes.ENUM(
              "transporte",
              "movimentacao",
              "carregamento",
              "desmontagem",
              "impostos",
              "comissao_terceiros",
              "taxa",
              "outro"
            ),
            allowNull: false,
          },
          description: { type: DataTypes.STRING(300), allowNull: false },
          amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
          approved_by: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: "users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
          },
          approved_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
          notes: DataTypes.TEXT,
          created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
          updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
        },
        { transaction: t }
      );
      await queryInterface.addIndex("costs", ["order_id"], { transaction: t });
      await queryInterface.addIndex("costs", ["order_item_id"], { transaction: t });

      // ---------- orders: condições da conclusão integral ----------
      await q(`CREATE TYPE "enum_orders_payment_status" AS ENUM ('aguardando','pago','estornado');`);
      await q(
        `CREATE TYPE "enum_orders_pickup_status" AS ENUM ('nao_aplicavel','aguardando','agendada','concluida');`
      );

      await queryInterface.addColumn(
        "orders",
        "payment_status",
        {
          type: "enum_orders_payment_status",
          allowNull: false,
          defaultValue: "aguardando",
        },
        { transaction: t }
      );
      await queryInterface.addColumn("orders", "payment_confirmed_at", DataTypes.DATE, { transaction: t });
      await queryInterface.addColumn(
        "orders",
        "pickup_status",
        { type: "enum_orders_pickup_status", allowNull: false, defaultValue: "aguardando" },
        { transaction: t }
      );
      await queryInterface.addColumn("orders", "pickup_completed_at", DataTypes.DATE, { transaction: t });
      await queryInterface.addColumn("orders", "operation_completed_at", DataTypes.DATE, { transaction: t });
      await queryInterface.addColumn(
        "orders",
        "has_open_issue",
        { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        { transaction: t }
      );
      await queryInterface.addColumn(
        "orders",
        "approved_costs",
        { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        { transaction: t }
      );

      // ---------- payouts: líquido, prazo e status financeiro ----------
      await queryInterface.addColumn(
        "payouts",
        "red_percent",
        { type: DataTypes.INTEGER, allowNull: false, defaultValue: 35 },
        { transaction: t }
      );
      await queryInterface.addColumn(
        "payouts",
        "approved_costs",
        { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        { transaction: t }
      );
      await queryInterface.addColumn(
        "payouts",
        "net_amount",
        { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
        { transaction: t }
      );
      await queryInterface.addColumn("payouts", "due_at", DataTypes.DATE, { transaction: t });
      await queryInterface.addColumn("payouts", "scheduled_at", DataTypes.DATE, { transaction: t });
      await queryInterface.addColumn("payouts", "payment_reference", DataTypes.STRING(160), {
        transaction: t,
      });

      // Sem custos registrados, o líquido dos repasses existentes é o bruto.
      await q(`UPDATE "payouts" SET "net_amount" = "gross_amount" WHERE "net_amount" = 0;`);
      await q(`UPDATE "payouts" SET "red_percent" = 100 - "supplier_percent";`);

      // ---------- status financeiro: novo vocabulário ----------
      await q(`ALTER TABLE "payouts" ALTER COLUMN "status" DROP DEFAULT;`);
      await q(`ALTER TABLE "payouts" ALTER COLUMN "status" TYPE text;`);
      await q(`DROP TYPE IF EXISTS "enum_payouts_status";`);
      await q(
        `CREATE TYPE "enum_payouts_status" AS ENUM ('venda_realizada','a_receber','pagamento_programado','pago','cancelado');`
      );
      // "pendente" era o estado anterior à conclusão — hoje chama-se venda_realizada.
      await q(`UPDATE "payouts" SET "status" = 'venda_realizada' WHERE "status" = 'pendente';`);
      await q(
        `ALTER TABLE "payouts" ALTER COLUMN "status" TYPE "enum_payouts_status" USING "status"::"enum_payouts_status";`
      );
      await q(`ALTER TABLE "payouts" ALTER COLUMN "status" SET DEFAULT 'venda_realizada';`);

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);

    await queryInterface.dropTable("costs");
    await q(`DROP TYPE IF EXISTS "enum_costs_type";`);

    for (const col of [
      "payment_status",
      "payment_confirmed_at",
      "pickup_status",
      "pickup_completed_at",
      "operation_completed_at",
      "has_open_issue",
      "approved_costs",
    ]) {
      await queryInterface.removeColumn("orders", col);
    }
    await q(`DROP TYPE IF EXISTS "enum_orders_payment_status";`);
    await q(`DROP TYPE IF EXISTS "enum_orders_pickup_status";`);

    for (const col of [
      "red_percent",
      "approved_costs",
      "net_amount",
      "due_at",
      "scheduled_at",
      "payment_reference",
    ]) {
      await queryInterface.removeColumn("payouts", col);
    }

    await q(`ALTER TABLE "payouts" ALTER COLUMN "status" DROP DEFAULT;`);
    await q(`ALTER TABLE "payouts" ALTER COLUMN "status" TYPE text;`);
    await q(`DROP TYPE IF EXISTS "enum_payouts_status";`);
    await q(`CREATE TYPE "enum_payouts_status" AS ENUM ('pendente','pago','cancelado');`);
    await q(`UPDATE "payouts" SET "status" = 'pendente' WHERE "status" <> 'pago';`);
    await q(
      `ALTER TABLE "payouts" ALTER COLUMN "status" TYPE "enum_payouts_status" USING "status"::"enum_payouts_status";`
    );
    await q(`ALTER TABLE "payouts" ALTER COLUMN "status" SET DEFAULT 'pendente';`);
  },
};
