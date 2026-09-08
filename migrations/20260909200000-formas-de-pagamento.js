"use strict";

/**
 * Formas de pagamento que faltavam no enum do pedido.
 *
 * `PAYMENT_METHODS` no ambiente ja oferecia cartao, e o checkout aceita — mas
 * o enum da coluna nao tinha, entao o pedido quebrava no INSERT depois de o
 * comprador ter escolhido. `transferencia` entra porque e como a RED opera
 * hoje: PIX e transferencia conferidos pelo financeiro.
 *
 * ALTER TYPE ... ADD VALUE nao roda dentro de transacao — por isso as queries
 * saem fora do bloco transacional padrao do sequelize-cli.
 */
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    for (const valor of ["cartao", "transferencia"]) {
      await q(`ALTER TYPE "enum_orders_payment_method" ADD VALUE IF NOT EXISTS '${valor}';`);
    }
  },

  async down() {
    // Postgres nao remove valor de enum sem recriar o tipo. Deixar o valor
    // orfao e mais seguro do que reescrever a coluna de uma tabela viva.
  },
};
