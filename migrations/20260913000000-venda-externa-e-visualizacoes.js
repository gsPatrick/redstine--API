"use strict";

/**
 * Venda fora do site (item 11) e contagem de visualizações (item 33).
 *
 * Três acréscimos, todos ADITIVOS — nenhuma linha existente é reescrita:
 *
 *  1. `orders.channel` — procedência da venda. Default `site` porque é o único
 *     canal que existia até aqui: todo pedido já gravado veio do checkout, e
 *     marcá-los de outra forma inventaria história. A venda por WhatsApp passa
 *     a ser distinguível SEM criar um fluxo paralelo: ela é o mesmo pedido,
 *     baixa o mesmo estoque e gera o mesmo repasse.
 *
 *  2. `orders.registered_by_id` — quem da RED registrou a venda externa. Numa
 *     venda do site não há operador; numa venda de telefone há, e é a única
 *     pista de quem digitou o valor. `SET NULL` na remoção do utilizador: o
 *     pedido tem de sobreviver ao desligamento de quem o registrou.
 *
 *  3. `assets.views_count` — contador desnormalizado de visualizações.
 *     A contagem PODE ser derivada da tabela `events`, e é de lá que sai o
 *     backfill abaixo. O que não pode é derivá-la a cada requisição: o catálogo
 *     devolve 100 cards e uma consulta de agregação por card seria N+1 no
 *     caminho mais quente do site. O contador é atualizado no mesmo lugar em
 *     que o evento nasce (events.service), e `events` continua sendo a fonte
 *     auditável — o contador é um índice dela, não a verdade substituta.
 *
 * O índice em (asset_id, session_id, type) existe para a deduplicação: antes de
 * contar uma visualização procura-se a mesma chave de visitante no mesmo ativo
 * dentro da janela. Sem índice esse SELECT varreria a tabela append-only de
 * eventos a cada abertura de página de produto.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelaPedidos = await queryInterface.describeTable("orders");

    if (!tabelaPedidos.channel) {
      await queryInterface.addColumn("orders", "channel", {
        type: Sequelize.ENUM("site", "whatsapp", "telefone", "presencial", "outro"),
        allowNull: false,
        defaultValue: "site",
      });
    }

    if (!tabelaPedidos.registered_by_id) {
      await queryInterface.addColumn("orders", "registered_by_id", {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    }

    const tabelaAtivos = await queryInterface.describeTable("assets");

    if (!tabelaAtivos.views_count) {
      await queryInterface.addColumn("assets", "views_count", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });

      // Backfill a partir da fonte real. Os eventos de visualização já eram
      // coletados desde o primeiro dia — ligar a exibição sem aproveitá-los
      // faria o site anunciar "0 visualizações" em ativos que já foram vistos.
      await queryInterface.sequelize.query(`
        UPDATE assets a
           SET views_count = COALESCE(e.total, 0)
          FROM (
                SELECT asset_id, COUNT(*) AS total
                  FROM events
                 WHERE type = 'product_view' AND asset_id IS NOT NULL
                 GROUP BY asset_id
               ) e
         WHERE e.asset_id = a.id;
      `);
    }

    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS events_asset_session_type
         ON events (asset_id, session_id, type);`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP INDEX IF EXISTS events_asset_session_type;");
    await queryInterface.removeColumn("assets", "views_count");
    await queryInterface.removeColumn("orders", "registered_by_id");
    await queryInterface.removeColumn("orders", "channel");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_orders_channel";');
  },
};
