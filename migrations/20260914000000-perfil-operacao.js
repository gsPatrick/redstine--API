"use strict";

/**
 * Perfil de acesso "Operação".
 *
 * O cliente recortou o painel em quatro áreas (Visão Geral | Comercial |
 * Operação | Financeiro) e pediu o mesmo recorte nas permissões: Master |
 * Comercial | Operação | Financeiro, cada um vendo apenas a sua área.
 *
 * A migração acrescenta o valor ao enum de `users.role` e nada mais. Em
 * particular NÃO há UPDATE nenhum: nenhum utilizador existente migra para
 * Operação. Quem hoje é `comercial` continua comercial, porque a pessoa que
 * administra consultas não é necessariamente a que responde pelo inventário —
 * adivinhar isso em SQL daria a alguém, em silêncio, acesso a uma área que a
 * RED não lhe atribuiu (ou tiraria o acesso que ela tem).
 *
 * As CAPACIDADES do perfil (`operation_read` / `operation_write`) não são
 * dados: vivem em `src/config/constants.js` e são aplicadas pelo middleware.
 * Não há tabela de permissões para migrar.
 *
 * `IF NOT EXISTS` porque um banco recriado a partir dos models já tem o valor,
 * e a migração precisa de poder correr duas vezes.
 *
 * Sem `down` que remova o valor: o PostgreSQL não suporta remover valor de
 * enum, e recriar o tipo apagaria as linhas de quem já usa o perfil.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'operacao';`
    );
  },

  async down() {
    // Intencionalmente vazio — ver o comentário no topo.
  },
};
