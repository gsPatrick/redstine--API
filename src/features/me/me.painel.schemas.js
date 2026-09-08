"use strict";

const { z } = require("zod");
const { ASSET_STATUS, PAYOUT_STATUS, QUOTE_STATUS } = require("../../config/constants");

/**
 * Campo de texto opcional vindo de formulário.
 *
 * Um `<form>` envia TODOS os campos, e os não preenchidos chegam como string
 * vazia. Sem este tratamento, deixar "Estado (UF)" em branco fazia o schema
 * recusar o formulário inteiro com "deve ter exatamente 2 caracteres" — o
 * utilizador não conseguia salvar o nome por causa de um campo que nem tocou.
 *
 * String vazia passa a significar "não informado", que é o que ela significa
 * num formulário.
 */
const textoOpcional = (schema) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

const paginacao = {
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
};

/** Periodo aceito pelos filtros temporais, igual em toda a plataforma. */
const periodoSchema = z.object({
  periodo: z.enum(["30d", "90d", "12m", "tudo"]).optional(),
  desde: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const comprasQuerySchema = z.object({
  ...paginacao,
  status: z
    .enum([
      "Aguardando confirmação",
      "Aguardando retirada",
      "Retirada agendada",
      "Retirado",
      "Concluído",
      "Cancelado",
    ])
    .optional(),
});

const consultasQuerySchema = z.object({
  ...paginacao,
  status: z.nativeEnum(QUOTE_STATUS).optional(),
});

const ativosQuerySchema = z.object({
  ...paginacao,
  status: z.nativeEnum(ASSET_STATUS).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

const vendasQuerySchema = z.object({
  ...paginacao,
  status: z.nativeEnum(PAYOUT_STATUS).optional(),
  desde: z.coerce.date().optional(),
});

/**
 * Enviar Ativos, pelo painel.
 *
 * Nao pede nome nem e-mail: a identidade vem do token. O que se pede sao os
 * campos minimos que a curadoria precisa para avaliar.
 */
const envioSchema = z.object({
  nome: z.string().trim().min(3, "Descreva o ativo.").max(220),
  categoryId: textoOpcional(z.string().uuid()),
  subcategoryId: textoOpcional(z.string().uuid()),
  quantidade: z.coerce.number().int().min(1),
  unidade: textoOpcional(z.string().trim().max(30)),
  condicao: textoOpcional(z.string().trim().max(60)),
  local: z.string().trim().min(2, "Informe a localização do ativo.").max(160),
  fotos: z.array(z.string().url()).max(8).optional(),
  observacoes: textoOpcional(z.string().trim().max(4000)),
});

const dadosSchema = z.object({
  nome: textoOpcional(z.string().trim().min(2).max(120)),
  sobrenome: textoOpcional(z.string().trim().max(120)),
  telefone: textoOpcional(z.string().trim().max(40)),
  cpf: textoOpcional(z.string().trim().max(20)),
  cidade: textoOpcional(z.string().trim().max(120)),
  estado: textoOpcional(z.string().trim().length(2)),
  // O e-mail é a identidade de login e não muda por aqui — o formulário o
  // envia desabilitado, então é aceito e ignorado em vez de rejeitado.
  email: z.any().optional(),
});

const empresaSchema = z.object({
  razaoSocial: textoOpcional(z.string().trim().max(200)),
  nomeFantasia: textoOpcional(z.string().trim().max(200)),
  cnpj: textoOpcional(z.string().trim().max(30)),
  cargo: textoOpcional(z.string().trim().max(120)),
  email: textoOpcional(z.string().email()),
});

const enderecoSchema = z.object({
  cep: textoOpcional(z.string().trim().max(12)),
  logradouro: textoOpcional(z.string().trim().max(200)),
  numero: textoOpcional(z.string().trim().max(20)),
  complemento: textoOpcional(z.string().trim().max(120)),
  bairro: textoOpcional(z.string().trim().max(120)),
  cidade: textoOpcional(z.string().trim().max(120)),
  estado: textoOpcional(z.string().trim().length(2)),
});

const enderecosSchema = z
  .object({ retirada: enderecoSchema.optional(), cobranca: enderecoSchema.optional() })
  .refine((v) => v.retirada || v.cobranca, {
    message: "Informe ao menos um endereço (retirada ou cobrança).",
  });

const senhaSchema = z.object({
  senhaAtual: z.string().min(1),
  novaSenha: z.string().min(8, "A nova senha precisa de ao menos 8 caracteres."),
});

module.exports = {
  envioSchema,
  periodoSchema,
  idParamSchema,
  comprasQuerySchema,
  consultasQuerySchema,
  ativosQuerySchema,
  vendasQuerySchema,
  dadosSchema,
  empresaSchema,
  enderecosSchema,
  senhaSchema,
  paginacao,
};
