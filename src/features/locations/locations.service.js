"use strict";

const db = require("../../models");
const { AppError } = require("../../utils/app-error");
const { slugify } = require("../../utils/slug");
const audit = require("../audit/audit.service");

/**
 * Localizações — a lista fechada de onde um ativo pode estar.
 *
 * Este ficheiro é o ÚNICO sítio que escreve `locations` e, por consequência, o
 * único que pode mexer no rótulo desnormalizado `assets.location`. É essa
 * exclusividade que torna a desnormalização segura: renomear aqui propaga
 * para os ativos na mesma transação, e não há segundo caminho por onde o
 * texto se desencontre da tabela.
 */

/** A lista que o formulário e o filtro oferecem: só as ativas, na ordem da RED. */
async function listar({ incluirInativas = false } = {}) {
  return db.Location.findAll({
    where: incluirInativas ? {} : { active: true },
    order: [
      ["position", "ASC"],
      ["name", "ASC"],
    ],
  });
}

/**
 * Resolve o que o cadastro mandou para o par (id, rótulo).
 *
 * Aceita `null`/vazio de propósito: "sem localização" é um estado legítimo e
 * medido (é a pendência operacional). O que NÃO se aceita é um id que não
 * existe ou que está inativo — seria reabrir a porta do texto livre por outro
 * nome.
 */
async function resolver(locationId) {
  if (locationId === null || locationId === undefined || locationId === "") {
    return { locationId: null, location: null };
  }
  const local = await db.Location.findByPk(locationId);
  if (!local) {
    throw AppError.badRequest("Localização inválida.", "LOCATION_INVALID", {
      disponiveis: (await listar()).map((l) => ({ id: l.id, name: l.name })),
    });
  }
  if (!local.active) {
    throw AppError.badRequest(
      `A localização "${local.name}" está inativa e não pode ser atribuída.`,
      "LOCATION_INACTIVE"
    );
  }
  return { locationId: local.id, location: local.name };
}

async function criar(dados, { ator } = {}) {
  const name = dados.name || `${dados.city} - ${dados.uf}`;
  const criada = await db.Location.create({
    ...dados,
    name,
    slug: dados.slug || slugify(name),
  });
  await audit.registrar({
    entity: "user",
    entityId: ator?.id || null,
    action: "configuracao",
    depois: criada.toJSON(),
    ator,
    notes: `Nova localização na lista fechada: ${criada.name}.`,
  });
  return criada;
}

/**
 * Editar uma localização.
 *
 * Mudar o nome REESCREVE o rótulo nos ativos dela. É a contrapartida de
 * guardar o rótulo no ativo, e tem de acontecer aqui — se ficasse a cargo de
 * quem chama, um dia não aconteceria e voltávamos a ter dois textos para o
 * mesmo lugar, que é o problema de origem.
 */
async function atualizar(id, dados, { ator } = {}) {
  const local = await db.Location.findByPk(id);
  if (!local) throw AppError.notFound("Localização não encontrada.", "LOCATION_NOT_FOUND");

  const antes = local.toJSON();
  await db.sequelize.transaction(async (transaction) => {
    await local.update(dados, { transaction });
    if (dados.name && dados.name !== antes.name) {
      await db.Asset.update(
        { location: local.name },
        { where: { locationId: local.id }, transaction }
      );
    }
  });

  await audit.registrar({
    entity: "user",
    entityId: ator?.id || null,
    action: "configuracao",
    antes,
    depois: local.toJSON(),
    ator,
    notes:
      dados.name && dados.name !== antes.name
        ? `Localização renomeada de "${antes.name}" para "${local.name}"; os ativos dela foram reetiquetados.`
        : `Localização ${local.name} atualizada.`,
  });

  return local;
}

/**
 * Quantos ativos em cada localização — a base do indicador do painel Operação.
 *
 * "Sem localização" entra na resposta como uma linha de `id: null`, e não é
 * enfeite: é o número que mede a pendência. Escondê-lo faria a distribuição
 * somar menos que o inventário e ninguém perceber porquê.
 */
async function distribuicao(where = {}) {
  const [locais, linhas] = await Promise.all([
    listar({ incluirInativas: true }),
    db.Asset.findAll({
      where,
      attributes: [
        "locationId",
        [db.sequelize.fn("COUNT", db.sequelize.col("Asset.id")), "total"],
        [db.sequelize.fn("SUM", db.sequelize.col("quantity")), "unidades"],
      ],
      group: ["Asset.location_id"],
      raw: true,
    }),
  ]);

  const porId = new Map(linhas.map((l) => [l.locationId, l]));
  const linha = (id, rotulo) => {
    const l = porId.get(id);
    return {
      id,
      rotulo,
      ativos: Number(l?.total || 0),
      unidades: Number(l?.unidades || 0),
    };
  };

  return [
    ...locais.map((l) => linha(l.id, l.name)),
    linha(null, "Sem localização"),
  ];
}

module.exports = { listar, resolver, criar, atualizar, distribuicao };
