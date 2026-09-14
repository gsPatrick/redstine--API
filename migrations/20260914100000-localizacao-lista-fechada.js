"use strict";

/**
 * Localização vira lista fechada.
 *
 * Decisão do cliente (12/09): "vamos manter a lista fechada e inicialmente
 * teremos apenas duas opções (Rio de Janeiro - RJ e São Paulo - SP)".
 *
 * `assets.location` era `STRING(140)` de texto livre e o resultado está na
 * base: "Rio de Janeiro/RJ" e "Rio de Janeiro — RJ" como se fossem lugares
 * diferentes, "Pilares/RJ" e "Pilares" idem, e metade do acervo sem nada.
 * Sobre isso não se constrói indicador nem filtro — o gráfico sairia errado
 * com cara de certo, e foi por isso que o indicador de Localizações do painel
 * Operação ficou bloqueado.
 *
 * O que esta migração faz:
 *
 *  1. cria `locations` e semeia as DUAS opções decididas;
 *  2. acrescenta `assets.location_id`, que passa a ser a verdade;
 *  3. normaliza o texto existente contra a lista;
 *  4. mantém `assets.location` como RÓTULO desnormalizado, escrito a partir
 *     da linha de `locations`.
 *
 * Por que manter a coluna de texto: o catálogo público, a busca, a exportação
 * e o `meta.filtros` que o front consome leem `assets.location` como string
 * em dezenas de sítios, incluindo consultas `raw`. Trocar tudo por um JOIN
 * para ganhar zero em correção seria risco sem prémio. A drift que a
 * desnormalização normalmente traz está fechada na origem: só o serviço de
 * localizações escreve neste par, e renomear uma localização propaga o novo
 * rótulo para os ativos dela na mesma transação (ver `locations.service.js`).
 *
 * ------------------------------------------------------------------ o mapa
 *
 * Mapeia-se o que é DEMONSTRÁVEL, não o que é plausível:
 *
 *   "Rio de Janeiro/RJ", "Rio de Janeiro — RJ", "Rio de Janeiro - RJ"
 *      -> Rio de Janeiro - RJ   (mesma cidade, três pontuações)
 *   "Pilares/RJ", "Pilares"
 *      -> Rio de Janeiro - RJ   (Pilares é bairro do município do Rio de
 *                                Janeiro; não é uma cidade inventada, é a
 *                                cidade a que o bairro pertence)
 *   "São Paulo — SP", "Sao Paulo/SP", ...
 *      -> São Paulo - SP
 *
 * Tudo o resto — "Belo Horizonte — MG", "Curitiba — PR", "Salvador — BA" —
 * fica EXPLICITAMENTE VAZIO (`location_id` nulo, `location` nulo). Não há
 * opção para essas cidades e inventá-las contrariava a decisão do cliente. O
 * ativo aparece como "sem localização", que é a pendência operacional que já
 * existe e que agora passa a incluí-lo. Quando a RED criar a cidade em
 * Configurações > Localizações, basta reatribuir o ativo.
 *
 * O `down` devolve o texto canónico e larga a coluna e a tabela. O que não
 * volta é a grafia antiga de cada registo — isso é o objetivo da migração,
 * não um efeito colateral.
 */

const LOCALIZACOES = [
  { slug: "rio-de-janeiro-rj", name: "Rio de Janeiro - RJ", city: "Rio de Janeiro", uf: "RJ", position: 1 },
  { slug: "sao-paulo-sp", name: "São Paulo - SP", city: "São Paulo", uf: "SP", position: 2 },
];

/**
 * Padrões reconhecidos por localização, comparados contra o texto já reduzido
 * a minúsculas e sem acento. São ancorados no início para "São Paulo" não
 * apanhar "São Paulo de Olivença".
 */
const PADROES = {
  "rio-de-janeiro-rj": ["rio de janeiro", "rio/rj", "rio - rj", "rio rj", "pilares"],
  "sao-paulo-sp": ["sao paulo"],
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;
    const q = (sql, opcoes) => queryInterface.sequelize.query(sql, opcoes);

    await queryInterface.createTable("locations", {
      id: { type: DataTypes.UUID, defaultValue: Sequelize.literal("gen_random_uuid()"), primaryKey: true },
      slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(140), allowNull: false },
      city: { type: DataTypes.STRING(120), allowNull: false },
      uf: { type: DataTypes.STRING(2), allowNull: false },
      position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });

    // `ON CONFLICT` porque um banco recriado a partir dos models pode já ter
    // as duas linhas, e a migração precisa de poder correr duas vezes.
    for (const l of LOCALIZACOES) {
      await q(
        `INSERT INTO "locations" ("id","slug","name","city","uf","position","active","created_at","updated_at")
         VALUES (gen_random_uuid(), :slug, :name, :city, :uf, :position, true, NOW(), NOW())
         ON CONFLICT ("slug") DO NOTHING;`,
        { replacements: l }
      );
    }

    await queryInterface.addColumn("assets", "location_id", {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "locations", key: "id" },
      onUpdate: "CASCADE",
      // Uma localização não se apaga (só se desativa); se alguma vez se
      // apagar, o ativo fica sem localização em vez de desaparecer junto.
      onDelete: "SET NULL",
    });
    await queryInterface.addIndex("assets", ["location_id"]);

    // ---------- normalização do texto existente ----------
    const normalizado = `lower(unaccent_simples(trim("location")))`;
    // `unaccent` é extensão e pode não estar instalada. Em vez de exigir uma
    // extensão para uma migração de uma vez, traduz-se o punhado de letras
    // que interessa — é determinístico e não depende do ambiente.
    await q(`
      CREATE OR REPLACE FUNCTION unaccent_simples(t text) RETURNS text AS $$
        SELECT translate($1,
          'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
          'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC');
      $$ LANGUAGE sql IMMUTABLE;
    `);

    for (const [slug, padroes] of Object.entries(PADROES)) {
      const condicao = padroes.map((_, i) => `${normalizado} LIKE :p${i}`).join(" OR ");
      const replacements = Object.fromEntries(padroes.map((p, i) => [`p${i}`, `${p}%`]));
      await q(
        `UPDATE "assets" a
            SET "location_id" = l."id", "location" = l."name"
           FROM "locations" l
          WHERE l."slug" = :slug
            AND a."location" IS NOT NULL
            AND (${condicao});`,
        { replacements: { ...replacements, slug } }
      );
    }

    // O resto fica explicitamente vazio — nas DUAS colunas, para não sobrar
    // texto solto a fingir que é dado.
    await q(`UPDATE "assets" SET "location" = NULL WHERE "location_id" IS NULL;`);

    await q(`DROP FUNCTION IF EXISTS unaccent_simples(text);`);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("assets", ["location_id"]).catch(() => {});
    await queryInterface.removeColumn("assets", "location_id");
    await queryInterface.dropTable("locations");
  },
};
