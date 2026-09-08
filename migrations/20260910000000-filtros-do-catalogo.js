"use strict";

/**
 * Filtros do catálogo especificados na página Comprar (V3.2, bloco 02).
 *
 * Três dimensões que o esquema não tinha e que a tela pede como filtro
 * principal:
 *
 *  - CONDIÇÃO passa de 3 para 5 valores. "usado" sozinho não distingue um
 *    ativo em bom estado de um que precisa de reparo — e essa diferença muda
 *    o preço e a decisão de compra.
 *  - FORMA DE VENDA (unidade, conjunto, lote) não é o mesmo que modalidade
 *    (direta, consulta). Uma diz COMO o ativo é vendido; a outra, SE o preço
 *    já está fechado. Um lote pode ser compra direta e uma unidade pode ser
 *    sob consulta.
 *  - DISPONIBILIDADE é operacional e independe do status do ativo: um ativo
 *    publicado pode estar reservado enquanto uma negociação corre.
 *
 * Os campos técnicos (peso, dimensões, potência, voltagem, capacidade,
 * acabamento, modelo) ficam em `attributes`, que já existe: variam por
 * categoria e virariam dezenas de colunas nulas.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;
    const q = (sql) => queryInterface.sequelize.query(sql);

    // ---------- condição: 3 -> 5 valores ----------
    await q(`ALTER TABLE "assets" ALTER COLUMN "condition" TYPE text;`);
    await q(`DROP TYPE IF EXISTS "enum_assets_condition";`);
    await q(
      `CREATE TYPE "enum_assets_condition" AS ENUM ('sem_uso','seminovo','usado_bom','usado_sinais','necessita_reparo');`
    );
    // O "usado" antigo vira "usado_bom": é a leitura mais provável do que já
    // foi cadastrado, e rebaixar para "necessita reparo" seria pior.
    await q(`UPDATE "assets" SET "condition" = 'usado_bom' WHERE "condition" = 'usado';`);
    await q(
      `ALTER TABLE "assets" ALTER COLUMN "condition" TYPE "enum_assets_condition" USING "condition"::"enum_assets_condition";`
    );

    // ---------- forma de venda ----------
    await queryInterface.addColumn("assets", "sale_format", {
      type: DataTypes.ENUM("unidade", "conjunto", "lote"),
      allowNull: false,
      defaultValue: "unidade",
    });

    // ---------- disponibilidade ----------
    await queryInterface.addColumn("assets", "availability", {
      type: DataTypes.ENUM("disponivel", "sujeito_confirmacao", "reservado"),
      allowNull: false,
      defaultValue: "disponivel",
    });

    await queryInterface.addIndex("assets", ["condition"]);
    await queryInterface.addIndex("assets", ["sale_format"]);
    await queryInterface.addIndex("assets", ["availability"]);
  },

  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);

    await queryInterface.removeColumn("assets", "sale_format");
    await queryInterface.removeColumn("assets", "availability");
    await q(`DROP TYPE IF EXISTS "enum_assets_sale_format";`);
    await q(`DROP TYPE IF EXISTS "enum_assets_availability";`);

    await q(`ALTER TABLE "assets" ALTER COLUMN "condition" TYPE text;`);
    await q(`DROP TYPE IF EXISTS "enum_assets_condition";`);
    await q(`CREATE TYPE "enum_assets_condition" AS ENUM ('sem_uso','seminovo','usado');`);
    await q(
      `UPDATE "assets" SET "condition" = 'usado' WHERE "condition" IN ('usado_bom','usado_sinais','necessita_reparo');`
    );
    await q(
      `ALTER TABLE "assets" ALTER COLUMN "condition" TYPE "enum_assets_condition" USING "condition"::"enum_assets_condition";`
    );
  },
};
