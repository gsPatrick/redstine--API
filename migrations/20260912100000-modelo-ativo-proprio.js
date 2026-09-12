"use strict";

/**
 * Modelo comercial "Ativo Próprio RED" (item 10 da revisão do cliente).
 *
 * Quando é a própria RED que cadastra o ativo não existe fornecedor terceiro,
 * logo não existe divisão: 100% do líquido é receita RED. Sem este modelo o
 * acervo próprio era cadastrado como `catalogo` e a plataforma reservava 65%
 * a um fornecedor inexistente — o número aparecia em "a repassar" e no
 * potencial do painel como dinheiro que ninguém iria receber.
 *
 * A migração é ADITIVA de propósito, e isso é a parte importante:
 *
 *  - `ADD VALUE` acrescenta o valor ao enum e não toca em nenhuma linha. NÃO
 *    há UPDATE aqui. O percentual de uma venda já realizada é um SNAPSHOT
 *    gravado em `payouts.supplier_percent` / `red_percent` no momento da
 *    confirmação (seção 8 do documento) — recalcular um repasse antigo porque
 *    a tabela de modelos mudou reescreveria história financeira já acordada
 *    com o fornecedor. Por isso nenhum ativo migra para o modelo novo: quem
 *    é acervo próprio passa a ser marcado como tal pela operação, ativo a
 *    ativo, e as vendas passadas continuam com o percentual que praticaram.
 *  - Os três enums recebem o valor: o do ativo (onde o modelo é escolhido),
 *    o do repasse (onde ele é congelado) e o da avaliação (onde a curadoria
 *    o recomenda). Faltando um só, o fluxo quebra no meio — a curadoria
 *    recomendaria um modelo que o ativo não aceita.
 *
 * `IF NOT EXISTS` porque o enum pode já ter o valor num banco recriado a
 * partir dos models, e a migração precisa de poder correr duas vezes.
 *
 * Não há `down` que remova o valor: o PostgreSQL não suporta remover valor de
 * enum, e recriar o tipo apagaria os dados de quem já usa o modelo. O `down`
 * é explicitamente um no-op documentado, em vez de um DROP TYPE que
 * destruiria linhas.
 */
const ENUMS = [
  "enum_assets_commercial_model",
  "enum_payouts_commercial_model",
  "enum_evaluations_recommended_model",
];

module.exports = {
  async up(queryInterface) {
    for (const tipo of ENUMS) {
      await queryInterface.sequelize.query(
        `ALTER TYPE "${tipo}" ADD VALUE IF NOT EXISTS 'proprio';`
      );
    }
  },

  async down() {
    // Intencionalmente vazio. Ver o comentário no topo: remover um valor de
    // enum no PostgreSQL exige recriar o tipo, e qualquer ativo ou repasse
    // gravado como `proprio` seria perdido nesse caminho.
  },
};
