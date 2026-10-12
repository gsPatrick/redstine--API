"use strict";

/**
 * Venda mínima e indicador de oportunidade do "sob consulta".
 *
 * Dois conceitos que o descritivo novo da página de produto introduz e que não
 * existiam em lugar nenhum:
 *
 *  1. `min_order_quantity` — a venda mínima. "A venda mínima é uma propriedade
 *     do produto e deve controlar o seletor de quantidade": o seletor começa
 *     nela, o "−" fica desativado quando se chega nela, e o carrinho tem de
 *     respeitar a mesma regra. Sem coluna, o front teria de adivinhar (ou a
 *     RED escreveria a mínima na descrição e ninguém a aplicaria).
 *
 *     Default 1 porque é o que todo o acervo já é hoje: unidade avulsa. 1 é
 *     também o valor que deixa o seletor com o comportamento antigo, de modo
 *     que nenhum ativo existente muda de comportamento com esta migração.
 *
 *  2. `consultation_note` — o indicador de oportunidade que substitui o preço
 *     no ativo sob consulta ("Até 30% abaixo do preço de mercado"). É texto
 *     editável na gestão, e não cálculo: no sob consulta não existe preço
 *     fechado, logo não existe percentual a derivar de `price`/`market_price`.
 *     Tentar calcular aqui seria publicar um desconto sobre um preço que ainda
 *     não foi negociado.
 *
 *     Fica curto (160) de propósito: o descritivo pede "pequeno e secundário",
 *     e um campo largo convida a escrever um parágrafo onde cabe uma linha.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.addColumn("assets", "min_order_quantity", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });

    await queryInterface.addColumn("assets", "consultation_note", {
      type: DataTypes.STRING(160),
      allowNull: true,
    });

    // Mínima acima do saldo deixaria o ativo impossível de comprar: o seletor
    // abriria num número que o estoque não cobre. Não acontece hoje (todas
    // nascem em 1), mas a correção é barata e fecha o estado inválido antes
    // de ele existir.
    await queryInterface.sequelize.query(
      `UPDATE "assets" SET "min_order_quantity" = 1
        WHERE "quantity" > 0 AND "min_order_quantity" > "quantity";`
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("assets", "consultation_note");
    await queryInterface.removeColumn("assets", "min_order_quantity");
  },
};
