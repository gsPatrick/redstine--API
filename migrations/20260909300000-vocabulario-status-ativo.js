"use strict";

/**
 * Alinha o status do ativo ao vocabulário oficial.
 *
 * O documento (seção 11) e as duas telas dizem: **Em avaliação, Aguardando
 * aprovação, Publicado, Vendido, Inativo**. O esquema tinha `em_curadoria` e
 * `arquivado` — termos internos que nunca chegaram a ser combinados com o
 * cliente e que não aparecem em tela nenhuma.
 *
 * Não é cosmético: com o nome errado, `ASSET_STATUS.EM_AVALIACAO` era
 * `undefined` no código, e um ativo enviado para avaliação caía silenciosamente
 * em `rascunho` — some da fila da curadoria sem ninguém perceber.
 *
 * `rascunho` e `aprovado` ficam: são etapas operacionais reais entre o envio e
 * a publicação, e o próprio documento permite acrescentar status que
 * correspondam a estados que a operação de fato tem.
 */
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);

    await q(`ALTER TABLE "assets" ALTER COLUMN "status" DROP DEFAULT;`);
    await q(`ALTER TABLE "assets" ALTER COLUMN "status" TYPE text;`);
    await q(`DROP TYPE IF EXISTS "enum_assets_status";`);
    await q(
      `CREATE TYPE "enum_assets_status" AS ENUM ('rascunho','em_avaliacao','aguardando_aprovacao','aprovado','publicado','vendido','inativo');`
    );
    await q(`UPDATE "assets" SET "status" = 'em_avaliacao' WHERE "status" = 'em_curadoria';`);
    await q(`UPDATE "assets" SET "status" = 'inativo' WHERE "status" = 'arquivado';`);
    await q(
      `ALTER TABLE "assets" ALTER COLUMN "status" TYPE "enum_assets_status" USING "status"::"enum_assets_status";`
    );
    await q(`ALTER TABLE "assets" ALTER COLUMN "status" SET DEFAULT 'rascunho';`);
  },

  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);

    await q(`ALTER TABLE "assets" ALTER COLUMN "status" DROP DEFAULT;`);
    await q(`ALTER TABLE "assets" ALTER COLUMN "status" TYPE text;`);
    await q(`DROP TYPE IF EXISTS "enum_assets_status";`);
    await q(
      `CREATE TYPE "enum_assets_status" AS ENUM ('rascunho','em_curadoria','aguardando_aprovacao','aprovado','publicado','vendido','arquivado');`
    );
    await q(`UPDATE "assets" SET "status" = 'em_curadoria' WHERE "status" = 'em_avaliacao';`);
    await q(`UPDATE "assets" SET "status" = 'arquivado' WHERE "status" = 'inativo';`);
    await q(
      `ALTER TABLE "assets" ALTER COLUMN "status" TYPE "enum_assets_status" USING "status"::"enum_assets_status";`
    );
    await q(`ALTER TABLE "assets" ALTER COLUMN "status" SET DEFAULT 'rascunho';`);
  },
};
