"use strict";

const db = require("../../models");
const { AppError } = require("../../utils/app-error");
const eventos = require("../events/events.service");
const { ASSET_STATUS } = require("../../config/constants");

const INCLUDE_ATIVO = () => ({
  model: db.Asset,
  as: "ativo",
  attributes: [
    "id", "slug", "name", "price", "marketPrice",
    "condition", "location", "status", "quantity", "saleMode",
        // A tela decide entre "Comprar" e "Consultar Condições" por estes dois:
        // um ativo reservado nao deve mostrar CTA de compra.
        "availability",
        "saleFormat",
  ],
  include: [
    { model: db.Category, as: "categoria", attributes: ["id", "slug", "name"] },
    {
      model: db.AssetImage,
      as: "imagens",
      attributes: ["url", "alt", "position"],
      separate: true,
      order: [["position", "ASC"]],
      limit: 1,
    },
  ],
});

async function listar(userId) {
  const linhas = await db.Wishlist.findAll({
    where: { userId },
    include: [INCLUDE_ATIVO()],
    order: [["createdAt", "DESC"]],
  });

  return linhas.map((linha) => {
    const json = linha.toJSON();
    // O favorito sobrevive ao ativo sair do ar — a lista mostra o estado real
    // em vez de esconder o item.
    json.disponivel = json.ativo?.status === ASSET_STATUS.PUBLICADO;
    return json;
  });
}

async function adicionar(userId, assetId) {
  const ativo = await db.Asset.findByPk(assetId);
  if (!ativo) throw AppError.notFound("Ativo nao encontrado.", "ASSET_NOT_FOUND");

  const [linha, criado] = await db.Wishlist.findOrCreate({
    where: { userId, assetId },
    defaults: { userId, assetId },
  });

  if (criado) {
    eventos.registrar(eventos.EVENTOS.FAVORITE_ADDED, { userId, assetId });
  }

  return { id: linha.id, assetId, criado };
}

async function remover(userId, assetId) {
  const removidos = await db.Wishlist.destroy({ where: { userId, assetId } });
  if (!removidos) throw AppError.notFound("Favorito nao encontrado.", "WISHLIST_ITEM_NOT_FOUND");
  eventos.registrar(eventos.EVENTOS.FAVORITE_REMOVED, { userId, assetId });
  return { ok: true };
}

/** Alterna — e o que o botao de coracao do site precisa numa chamada so. */
async function alternar(userId, assetId) {
  const existente = await db.Wishlist.findOne({ where: { userId, assetId } });
  if (existente) {
    await existente.destroy();
    return { assetId, favorito: false };
  }
  await adicionar(userId, assetId);
  return { assetId, favorito: true };
}

/**
 * Importa os favoritos que estavam no localStorage quando o visitante cria
 * conta ou entra — sem isto o utilizador perde a lista ao autenticar.
 */
async function sincronizar(userId, assetIds) {
  const existentes = await db.Asset.findAll({
    where: { id: assetIds },
    attributes: ["id"],
  });

  const validos = existentes.map((a) => a.id);
  if (!validos.length) return { importados: 0, ignorados: assetIds.length };

  const registros = validos.map((assetId) => ({ userId, assetId }));
  await db.Wishlist.bulkCreate(registros, { ignoreDuplicates: true });

  return { importados: validos.length, ignorados: assetIds.length - validos.length };
}

module.exports = { listar, adicionar, remover, alternar, sincronizar };
