"use strict";

const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const mailer = require("../../providers/mailer");
const db = require("../../models");
const { env } = require("../../config/env");
const { AppError } = require("../../utils/app-error");
const { CAPS_POR_PAPEL } = require("../../config/constants");
const { ROLES, USER_STATUS } = require("../../config/constants");

const ROUNDS = 10;

function emitirToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  });
}

/**
 * Perfil publico do utilizador, com as capacidades derivadas do papel.
 *
 * As capacidades vao junto para o front saber que menu montar. Derivadas, nunca
 * guardadas: uma lista gravada por utilizador ficaria dessincronizada da regra
 * assim que a matriz mudasse — e o front passaria a mostrar um menu que a API
 * recusa.
 */
function publico(user) {
  const { passwordHash, ...resto } = user.toJSON();
  resto.capabilities = CAPS_POR_PAPEL[resto.role] || [];
  resto.acessaPainelDeGestao = resto.capabilities.length > 0;
  return resto;
}

async function registrar(dados) {
  const email = dados.email.toLowerCase().trim();

  const existente = await db.User.findOne({ where: { email }, paranoid: false });
  if (existente) {
    throw AppError.conflict("Ja existe uma conta com este e-mail.", "EMAIL_IN_USE");
  }

  // O papel nunca vem do cliente: registo publico cria comprador ou fornecedor.
  const role = dados.role === ROLES.FORNECEDOR ? ROLES.FORNECEDOR : ROLES.COMPRADOR;

  const user = await db.User.create({
    name: dados.name.trim(),
    email,
    passwordHash: await bcrypt.hash(dados.password, ROUNDS),
    role,
    status: USER_STATUS.ATIVO,
    phone: dados.phone,
    company: dados.company,
    document: dados.document,
    city: dados.city,
    state: dados.state,
  });

  return { user: publico(user), token: emitirToken(user) };
}

async function autenticar({ email, password }) {
  const user = await db.User.scope("comSenha").findOne({
    where: { email: email.toLowerCase().trim() },
  });

  // Mensagem unica para e-mail inexistente e senha errada — nao revela quais
  // e-mails estao cadastrados.
  const generico = AppError.unauthorized("E-mail ou senha invalidos.", "INVALID_CREDENTIALS");
  if (!user) throw generico;

  const confere = await bcrypt.compare(password, user.passwordHash);
  if (!confere) throw generico;

  if (user.status !== USER_STATUS.ATIVO) {
    throw AppError.forbidden("Conta inativa.", "USER_INACTIVE");
  }

  await user.update({ lastLoginAt: new Date() });

  return { user: publico(user), token: emitirToken(user) };
}

async function trocarSenha(userId, { currentPassword, newPassword }) {
  const user = await db.User.scope("comSenha").findByPk(userId);
  if (!user) throw AppError.notFound("Utilizador nao encontrado.");

  const confere = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!confere) throw AppError.badRequest("Senha atual incorreta.", "WRONG_PASSWORD");

  await user.update({ passwordHash: await bcrypt.hash(newPassword, ROUNDS) });
  return { ok: true };
}

/** Guarda so o hash do token — o valor em claro so existe no e-mail. */
function hashDoToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Pede recuperacao de senha.
 *
 * Responde igual para e-mail existente e inexistente. Resposta diferente
 * permitiria enumerar contas — o mesmo motivo do login devolver mensagem unica.
 */
async function pedirRecuperacao({ email }, { ip } = {}) {
  const user = await db.User.findOne({ where: { email: email.toLowerCase().trim() } });

  if (user && user.status === USER_STATUS.ATIVO) {
    // Invalida pedidos anteriores ainda abertos: um link ativo de cada vez.
    await db.PasswordReset.update(
      { usedAt: new Date() },
      { where: { userId: user.id, usedAt: null } }
    );

    const token = crypto.randomBytes(32).toString("hex");
    const expiraEm = new Date(Date.now() + env.auth.resetTokenTtlMinutes * 60 * 1000);

    await db.PasswordReset.create({
      userId: user.id,
      tokenHash: hashDoToken(token),
      expiresAt: expiraEm,
      requestedIp: ip,
    });

    await mailer.recuperacaoDeSenha(user, token);
  }

  return {
    ok: true,
    message: "Se existir uma conta com este e-mail, enviamos as instrucoes.",
  };
}

async function redefinirSenha({ token, newPassword }) {
  const registro = await db.PasswordReset.findOne({
    where: {
      tokenHash: hashDoToken(token),
      usedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
    include: [{ association: "utilizador" }],
  });

  if (!registro) {
    throw AppError.badRequest("Link invalido ou expirado.", "INVALID_RESET_TOKEN");
  }

  const user = await db.User.scope("comSenha").findByPk(registro.userId);
  if (!user) throw AppError.notFound("Utilizador nao encontrado.");

  await db.sequelize.transaction(async (t) => {
    await user.update(
      { passwordHash: await bcrypt.hash(newPassword, ROUNDS) },
      { transaction: t }
    );
    await registro.update({ usedAt: new Date() }, { transaction: t });
  });

  return { ok: true };
}

module.exports = {
  registrar,
  autenticar,
  trocarSenha,
  publico,
  pedirRecuperacao,
  redefinirSenha,
};
