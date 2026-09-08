"use strict";

const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");
const db = require("../../models");
const { AppError } = require("../../utils/app-error");
const { parsePagination } = require("../../utils/pagination");
const { CAPS_POR_PAPEL, USER_STATUS } = require("../../config/constants");

/**
 * Linha da tabela de Usuarios do painel.
 *
 * As capacidades vao junto porque a tela as exibe ao lado do perfil — e porque
 * mostrar o perfil sozinho esconde o que ele de facto pode fazer. Elas sao
 * derivadas do papel, nao guardadas: uma lista gravada por utilizador ficaria
 * dessincronizada da regra assim que a matriz mudasse.
 */
function linhaDeUsuario(u) {
  return {
    id: u.id,
    nome: [u.name, u.lastName].filter(Boolean).join(" "),
    email: u.email,
    perfil: u.role,
    capacidades: CAPS_POR_PAPEL[u.role] || [],
    acessaPainelDeGestao: (CAPS_POR_PAPEL[u.role] || []).length > 0,
    empresa: u.companyTradeName || u.company || null,
    telefone: u.phone,
    ativo: u.status === "ativo",
    status: u.status,
    ultimoAcesso: u.lastLoginAt,
    criadoEm: u.createdAt,
  };
}

async function listar(query) {
  const { page, perPage, limit, offset } = parsePagination(query);
  const where = {};
  if (query.role) where.role = query.role;
  if (query.status) where.status = query.status;
  if (query.search) {
    const termo = `%${query.search}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: termo } },
      { email: { [Op.iLike]: termo } },
      { company: { [Op.iLike]: termo } },
    ];
  }

  const resultado = await db.User.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return {
    rows: resultado.rows.map(linhaDeUsuario),
    count: resultado.count,
    page,
    perPage,
  };
}

async function porId(id) {
  const user = await db.User.findByPk(id);
  if (!user) throw AppError.notFound("Utilizador nao encontrado.", "USER_NOT_FOUND");
  return user;
}

/** Criacao interna: e o unico caminho que pode atribuir papel admin/curador. */
async function criar(dados) {
  const email = dados.email.toLowerCase().trim();
  const existente = await db.User.findOne({ where: { email }, paranoid: false });
  if (existente) throw AppError.conflict("E-mail ja cadastrado.", "EMAIL_IN_USE");

  const user = await db.User.create({
    ...dados,
    email,
    passwordHash: await bcrypt.hash(dados.password, 10),
  });

  return porId(user.id);
}

async function atualizar(id, dados) {
  const user = await db.User.findByPk(id);
  if (!user) throw AppError.notFound("Utilizador nao encontrado.", "USER_NOT_FOUND");

  if (dados.password) {
    dados.passwordHash = await bcrypt.hash(dados.password, 10);
    delete dados.password;
  }

  await user.update(dados);
  return porId(user.id);
}

async function remover(id, { atorId }) {
  if (id === atorId) {
    throw AppError.badRequest("Nao e possivel remover a propria conta.", "SELF_DELETE");
  }
  const user = await db.User.findByPk(id);
  if (!user) throw AppError.notFound("Utilizador nao encontrado.", "USER_NOT_FOUND");
  await user.destroy();
  return { ok: true };
}

module.exports = { listar, porId, criar, atualizar, remover, linhaDeUsuario };
