"use strict";

/**
 * Agora que /gestao/comercial/envios/:id existe, a notificacao de novo envio
 * volta a apontar para o proprio envio.
 *
 * Na migration anterior ela caiu na listagem de ativos porque nao havia tela
 * de envio nenhuma — era o mais perto que o front oferecia. Aqui o id volta,
 * lido do proprio registo, que ja guarda entity/entityId.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      update notifications
         set link = '/gestao/comercial/envios/' || entity_id
       where type = 'novo_envio'
         and entity = 'submission'
         and entity_id is not null
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `update notifications set link = '/gestao/comercial/ativos' where type = 'novo_envio'`
    );
  },
};
