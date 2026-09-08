"use strict";

/**
 * Atributos estruturados do envio.
 *
 * O formulario "Enviar Ativos" do painel coleta categoria, subcategoria,
 * condicao, quantidade, unidade e localizacao — dados que a curadoria usa para
 * avaliar e que antes so caberiam no texto livre da descricao. Guardar em
 * JSONB e o meio-termo honesto: sao dados de UM formulario, ainda em triagem,
 * que so viram colunas proprias quando o ativo e aprovado e nasce como Asset.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("submissions", "attributes", {
      type: Sequelize.DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("submissions", "attributes");
  },
};
