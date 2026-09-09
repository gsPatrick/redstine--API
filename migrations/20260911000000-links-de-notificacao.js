"use strict";

/**
 * Reaponta os links das notificacoes ja gravadas.
 *
 * As notificacoes guardam o link no proprio registo, entao corrigir apenas os
 * modelos que geram novas deixaria as antigas apontando para `/my-account/...`
 * — area substituida pelo painel e que nao existe mais — e para rotas de
 * detalhe que nunca existiram. Clicar no sino dava 404.
 *
 * Onde ha pagina de detalhe o id e preservado; onde nao ha, cai na listagem.
 */
module.exports = {
  async up(queryInterface) {
    const sql = (de, para) =>
      queryInterface.sequelize.query(
        `update notifications set link = ${para} where link like '${de}'`
      );

    await sql("/my-account/consultas/%", "replace(link, '/my-account/consultas/', '/painel/consultas/')");
    await sql("/my-account/compras/%", "replace(link, '/my-account/compras/', '/painel/compras/')");
    await sql("/my-account/ativos/%", "'/painel/vender/ativos'");
    await sql("/my-account/vendas%", "'/painel/vender/vendas'");
    await sql("/my-account/financeiro%", "'/painel/vender/financeiro'");
    await sql("/gestao/comercial/consultas/%", "'/gestao/comercial/consultas'");
    await sql("/gestao/comercial/envios%", "'/gestao/comercial/ativos'");
    await sql("/gestao/comercial/vendas/%", "'/gestao/comercial/vendas'");
  },

  // Sem down: recolocar rotas que dao 404 nao e um estado ao qual valha voltar.
  async down() {},
};
