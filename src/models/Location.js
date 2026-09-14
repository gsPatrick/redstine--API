"use strict";

const { DataTypes } = require("sequelize");

/**
 * Localização — lista FECHADA de onde um ativo pode estar.
 *
 * Decisão do cliente (12/09): "vamos manter a lista fechada e inicialmente
 * teremos apenas duas opções (Rio de Janeiro - RJ e São Paulo - SP)".
 *
 * É uma TABELA e não um enum, e a razão cabe numa pergunta: quem adiciona a
 * terceira cidade? Com enum, um programador — migração, deploy e janela. Com
 * tabela, a própria RED, em Configurações > Localizações, no mesmo lugar onde
 * já cria categoria. A lista continua fechada para quem cadastra o ativo (o
 * formulário só oferece o que está aqui e a API recusa o resto); o que muda é
 * quem tem a chave da lista.
 *
 * Também não ficou em `settings`: settings é chave/valor escalar para
 * parâmetro (percentual, prazo), não tem unicidade, nem `active`, nem ordem, e
 * sobretudo não tem como o ativo APONTAR para o valor. Uma cidade renomeada
 * em settings deixaria os ativos com o texto antigo — que é exatamente o
 * problema que estamos a resolver.
 */
module.exports = (sequelize) => {
  const Location = sequelize.define(
    "Location",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      /** Rótulo exibido em toda a plataforma. É a forma canónica: "Rio de Janeiro - RJ". */
      name: { type: DataTypes.STRING(140), allowNull: false },
      city: { type: DataTypes.STRING(120), allowNull: false },
      uf: { type: DataTypes.STRING(2), allowNull: false },
      position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      /**
       * Desativar em vez de apagar. Uma localização com ativos não pode
       * desaparecer — o histórico ficaria a apontar para o nada. Inativa sai
       * do formulário e do filtro; o que já foi cadastrado continua legível.
       */
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: "locations", underscored: true }
  );

  Location.associate = (models) => {
    Location.hasMany(models.Asset, { as: "ativos", foreignKey: "locationId" });
  };

  return Location;
};
