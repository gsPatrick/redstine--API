"use strict";

const bcrypt = require("bcryptjs");
const db = require("../../models");
const { AppError } = require("../../utils/app-error");
const audit = require("../audit/audit.service");

/**
 * Minha Conta — dados cadastrais, empresa, enderecos e seguranca.
 *
 * Tudo escopado ao token. Nenhuma destas rotas aceita `userId` no corpo: a
 * identidade vem do JWT, e nao de um campo que o cliente pode escrever.
 */

const PUBLICO = [
  "id",
  "name",
  "lastName",
  "email",
  "phone",
  "document",
  "role",
  "city",
  "state",
  "companyLegalName",
  "companyTradeName",
  "companyDocument",
  "companyRole",
  "companyEmail",
  "lastLoginAt",
  "createdAt",
];

async function perfil(userId) {
  const u = await db.User.findByPk(userId, {
    attributes: PUBLICO,
    include: [{ model: db.Address, as: "enderecos" }],
  });
  if (!u) throw AppError.notFound("Usuário não encontrado.", "USER_NOT_FOUND");

  const enderecos = Object.fromEntries((u.enderecos || []).map((e) => [e.type, formatarEndereco(e)]));

  return {
    dados: {
      nome: u.name,
      sobrenome: u.lastName,
      email: u.email,
      telefone: u.phone,
      cpf: u.document,
      papel: u.role,
      cidade: u.city,
      estado: u.state,
    },
    empresa: {
      razaoSocial: u.companyLegalName,
      nomeFantasia: u.companyTradeName,
      cnpj: u.companyDocument,
      cargo: u.companyRole,
      email: u.companyEmail,
    },
    enderecos: {
      retirada: enderecos.retirada || null,
      cobranca: enderecos.cobranca || null,
    },
    ultimoAcesso: u.lastLoginAt,
  };
}

const formatarEndereco = (e) => ({
  id: e.id,
  cep: e.zip,
  logradouro: e.street,
  numero: e.number,
  complemento: e.complement,
  bairro: e.district,
  cidade: e.city,
  estado: e.state,
});

async function atualizarDados(userId, dados, { ator } = {}) {
  const u = await db.User.findByPk(userId);
  if (!u) throw AppError.notFound("Usuário não encontrado.", "USER_NOT_FOUND");

  const mapa = {
    nome: "name",
    sobrenome: "lastName",
    telefone: "phone",
    cpf: "document",
    cidade: "city",
    estado: "state",
  };
  // O e-mail e a identidade de login: trocar por aqui, sem reverificacao,
  // permitiria tomar a conta de outro utilizador. Fica fora de proposito.
  const patch = {};
  for (const [de, para] of Object.entries(mapa)) {
    if (dados[de] !== undefined) patch[para] = dados[de];
  }

  const antes = Object.fromEntries(Object.values(mapa).map((c) => [c, u[c]]));
  await u.update(patch);

  await audit.registrar({
    entity: "user",
    entityId: userId,
    action: "dados_cadastrais",
    antes,
    depois: patch,
    ator,
  });

  return perfil(userId);
}

async function atualizarEmpresa(userId, dados, { ator } = {}) {
  const u = await db.User.findByPk(userId);
  if (!u) throw AppError.notFound("Usuário não encontrado.", "USER_NOT_FOUND");

  const mapa = {
    razaoSocial: "companyLegalName",
    nomeFantasia: "companyTradeName",
    cnpj: "companyDocument",
    cargo: "companyRole",
    email: "companyEmail",
  };
  const patch = {};
  for (const [de, para] of Object.entries(mapa)) {
    if (dados[de] !== undefined) patch[para] = dados[de];
  }

  const antes = Object.fromEntries(Object.values(mapa).map((c) => [c, u[c]]));
  await u.update(patch);

  await audit.registrar({
    entity: "user",
    entityId: userId,
    action: "empresa",
    antes,
    depois: patch,
    ator,
  });

  return perfil(userId);
}

/** Grava retirada e/ou cobranca. Um por tipo — o indice unico garante. */
async function gravarEnderecos(userId, corpo, { ator } = {}) {
  const mapa = {
    cep: "zip",
    logradouro: "street",
    numero: "number",
    complemento: "complement",
    bairro: "district",
    cidade: "city",
    estado: "state",
  };

  for (const tipo of ["retirada", "cobranca"]) {
    if (!corpo[tipo]) continue;
    const valores = { userId, type: tipo };
    for (const [de, para] of Object.entries(mapa)) {
      if (corpo[tipo][de] !== undefined) valores[para] = corpo[tipo][de];
    }

    const existente = await db.Address.findOne({ where: { userId, type: tipo } });
    if (existente) await existente.update(valores);
    else await db.Address.create(valores);
  }

  await audit.registrar({
    entity: "user",
    entityId: userId,
    action: "enderecos",
    depois: corpo,
    ator,
  });

  return (await perfil(userId)).enderecos;
}

/**
 * Alteracao de senha.
 *
 * Exige a senha atual mesmo com sessao valida: uma sessao esquecida aberta num
 * computador partilhado nao pode virar troca de senha.
 */
async function alterarSenha(userId, { senhaAtual, novaSenha }, { ator } = {}) {
  const u = await db.User.scope("comSenha").findByPk(userId);
  if (!u) throw AppError.notFound("Usuário não encontrado.", "USER_NOT_FOUND");

  const confere = await bcrypt.compare(senhaAtual, u.passwordHash);
  if (!confere) throw AppError.badRequest("Senha atual incorreta.", "WRONG_PASSWORD");

  await u.update({ passwordHash: await bcrypt.hash(novaSenha, 10) });

  await audit.registrar({
    entity: "user",
    entityId: userId,
    action: "senha_alterada",
    ator,
    notes: "Alteração feita pelo próprio usuário na área de Segurança.",
  });

  return { ok: true };
}

module.exports = { perfil, atualizarDados, atualizarEmpresa, gravarEnderecos, alterarSenha };
