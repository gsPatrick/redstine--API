require("dotenv").config();

const bcrypt = require("bcryptjs");
const db = require("../src/models");

/**
 * Redefinicao administrativa de senha.
 *
 * O seed usa findOrCreate: depois que a conta existe, ele nunca mais toca na
 * senha. Isso e o correto — um restart do container nao pode reverter a senha
 * de producao —, mas deixava o sistema sem nenhuma forma suportada de recuperar
 * um acesso perdido a nao ser mexendo no banco a mao.
 *
 *   node scripts/redefinir-senha.js <email> <nova-senha>
 */
async function main() {
  const [email, senha] = process.argv.slice(2);

  if (!email || !senha) {
    console.error("uso: node scripts/redefinir-senha.js <email> <nova-senha>");
    process.exitCode = 1;
    return;
  }

  if (senha.length < 8) {
    console.error("[senha] a nova senha precisa de pelo menos 8 caracteres.");
    process.exitCode = 1;
    return;
  }

  await db.sequelize.authenticate();

  const utilizador = await db.User.findOne({ where: { email } });
  if (!utilizador) {
    console.error(`[senha] nenhuma conta com o email ${email}.`);
    process.exitCode = 1;
    return;
  }

  utilizador.passwordHash = await bcrypt.hash(senha, 10);
  await utilizador.save();

  console.log(`[senha] redefinida para ${utilizador.email} (${utilizador.role}).`);
}

main()
  .catch((erro) => {
    console.error("[senha] falhou:", erro.message);
    process.exitCode = 1;
  })
  .finally(() => db.sequelize.close());
