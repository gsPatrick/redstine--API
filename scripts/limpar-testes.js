"use strict";

/**
 * Remove os ativos criados pelos testes.
 *
 * O smoke test cria um ativo publicado a cada execução, e eles apareciam na
 * vitrine junto com o catálogo real. Marcá-los com `[smoke]` no nome e limpar
 * aqui é mais seguro do que apagar por data ou por padrão de slug — nenhum
 * ativo real vai ter essa marca.
 *
 * Só toca no que tem a marca. Ativos reais, do seed de demonstração e do
 * catálogo importado ficam intactos.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);

const { Op } = require("sequelize");
const db = require("../src/models");

async function main() {
  const alvos = await db.Asset.findAll({
    where: { name: { [Op.iLike]: "%[smoke]%" } },
    attributes: ["id"],
    paranoid: false,
  });
  const ids = alvos.map((a) => a.id);

  if (!ids.length) {
    console.log("nada a limpar: nenhum ativo de teste encontrado.");
    return db.sequelize.close();
  }

  // A ordem importa: repasses e itens apontam para o ativo, e o banco recusa
  // apagar um registro ainda referenciado.
  const pedidos = await db.OrderItem.findAll({
    where: { assetId: { [Op.in]: ids } },
    attributes: ["orderId"],
  });
  const orderIds = [...new Set(pedidos.map((i) => i.orderId))];

  const contagem = {
    repasses: await db.Payout.destroy({ where: { assetId: { [Op.in]: ids } }, force: true }),
    custos: orderIds.length
      ? await db.Cost.destroy({ where: { orderId: { [Op.in]: orderIds } }, force: true })
      : 0,
    itens: await db.OrderItem.destroy({ where: { assetId: { [Op.in]: ids } }, force: true }),
    pedidos: orderIds.length
      ? await db.Order.destroy({ where: { id: { [Op.in]: orderIds } }, force: true })
      : 0,
    cotacoes: await db.Quote.destroy({ where: { assetId: { [Op.in]: ids } }, force: true }),
    favoritos: await db.Wishlist.destroy({ where: { assetId: { [Op.in]: ids } }, force: true }),
    eventos: await db.Event.destroy({ where: { assetId: { [Op.in]: ids } }, force: true }),
    imagens: await db.AssetImage.destroy({ where: { assetId: { [Op.in]: ids } }, force: true }),
    ativos: await db.Asset.destroy({ where: { id: { [Op.in]: ids } }, force: true }),
  };

  console.log("dados de teste removidos:", contagem);
  console.log(
    "ativos publicados restantes:",
    await db.Asset.count({ where: { status: "publicado" } })
  );
  await db.sequelize.close();
}

main().catch((e) => {
  console.error("limpeza falhou:", e.message);
  process.exit(1);
});
