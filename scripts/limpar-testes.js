"use strict";

/**
 * Remove os ativos criados pelos testes.
 *
 * O smoke test cria um ativo publicado a cada execução, e eles apareciam na
 * vitrine junto com o catálogo real. Marcá-los com `[smoke]` (scripts de API)
 * ou `[e2e]` (conferência no navegador) no nome e limpar aqui é mais seguro do
 * que apagar por data ou por padrão de slug — nenhum ativo real vai ter essas
 * marcas.
 *
 * Só toca no que tem a marca. Ativos reais, do seed de demonstração e do
 * catálogo importado ficam intactos.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);

const { Op } = require("sequelize");
const db = require("../src/models");

async function main() {
  // Duas marcas, nao uma: `[smoke]` vem dos scripts de API e `[e2e]` das
  // conferencias no navegador. Enquanto so a primeira era limpa, os ativos
  // criados pelo Playwright ficavam na vitrine real.
  const alvos = await db.Asset.findAll({
    where: { [Op.or]: [{ name: { [Op.iLike]: "%[smoke]%" } }, { name: { [Op.iLike]: "%[e2e]%" } }] },
    attributes: ["id"],
    paranoid: false,
  });
  const ids = alvos.map((a) => a.id);

  // Categorias de teste vao a parte: nao dependem de existir ativo [smoke], e
  // ficavam para tras poluindo o catalogo e os filtros. So apaga as vazias —
  // uma categoria com ativo dentro nunca e de teste.
  const catsTeste = await db.Category.findAll({
    where: { name: { [Op.iLike]: "%teste%" } },
    attributes: ["id", "name"],
  });
  for (const c of catsTeste) {
    const usada = await db.Asset.count({ where: { categoryId: c.id }, paranoid: false });
    if (usada) continue;
    await db.Subcategory.destroy({ where: { categoryId: c.id }, force: true });
    await db.Category.destroy({ where: { id: c.id }, force: true });
    console.log(`categoria de teste removida: ${c.name}`);
  }

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
