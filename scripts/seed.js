"use strict";

/**
 * Semeia o minimo para a API ser utilizavel: um admin, as 3 categorias e as 15
 * subcategorias reais da RED. Idempotente — pode correr varias vezes.
 */

const bcrypt = require("bcryptjs");
const db = require("../src/models");
const { ROLES } = require("../src/config/constants");

const CATALOGO = [
  {
    slug: "red-construcao",
    name: "RED Construção",
    description:
      "Materiais excedentes, componentes reaproveitáveis e itens para obras, reformas e manutenção.",
    subs: [
      "Hidráulica",
      "Elétrica",
      "Pisos e Revestimentos",
      "Louças, Metais e Sanitários",
      "Ferragens e Acessórios",
    ],
  },
  {
    slug: "red-equipamentos",
    name: "RED Equipamentos",
    description: "Máquinas, ferramentas e equipamentos técnicos, operacionais e comerciais.",
    subs: [
      "Cozinha Industrial",
      "Refrigeração e Conservação",
      "Climatização e Ventilação",
      "Iluminação",
      "TI, Automação e Telefonia",
    ],
  },
  {
    slug: "red-mobiliario",
    name: "RED Mobiliário",
    description: "Mobiliário corporativo, hoteleiro, residencial e operacional.",
    subs: ["Escritório", "Hotelaria", "Comércio e Varejo", "Residencial", "Áreas Externas"],
  },
];

const { slugify } = require("../src/utils/slug");

async function main() {
  await db.sequelize.authenticate();

  const emailAdmin = process.env.SEED_ADMIN_EMAIL || "admin@redestine.com.br";
  const senhaAdmin = process.env.SEED_ADMIN_PASSWORD || "RedAdmin2026!";

  const [admin, criado] = await db.User.findOrCreate({
    where: { email: emailAdmin },
    defaults: {
      name: "Administrador RED",
      email: emailAdmin,
      passwordHash: await bcrypt.hash(senhaAdmin, 10),
      role: ROLES.ADMIN,
    },
  });
  console.log(criado ? `[seed] admin criado: ${admin.email}` : `[seed] admin ja existia: ${admin.email}`);

  for (const [i, cat] of CATALOGO.entries()) {
    const [categoria] = await db.Category.findOrCreate({
      where: { slug: cat.slug },
      defaults: { slug: cat.slug, name: cat.name, description: cat.description, position: i },
    });

    for (const [j, nomeSub] of cat.subs.entries()) {
      await db.Subcategory.findOrCreate({
        where: { categoryId: categoria.id, slug: slugify(nomeSub) },
        defaults: {
          categoryId: categoria.id,
          slug: slugify(nomeSub),
          name: nomeSub,
          position: j,
        },
      });
    }
    console.log(`[seed] ${cat.name}: ${cat.subs.length} subcategorias`);
  }

  console.log("\n[seed] concluido.");
  if (criado) {
    console.log(`      login: ${emailAdmin}`);
    console.log(`      senha: ${senhaAdmin}  <- troque depois do primeiro acesso`);
  }

  await db.sequelize.close();
}

main().catch((err) => {
  console.error("[seed] falhou:", err);
  process.exit(1);
});
