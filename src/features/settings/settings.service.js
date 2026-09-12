"use strict";

const db = require("../../models");
const { env } = require("../../config/env");
const audit = require("../audit/audit.service");
const { PRAZO_REPASSE_HORAS, MODELOS_COMERCIAIS } = require("../../config/constants");

/**
 * Configuracoes da plataforma.
 *
 * O .env continua sendo o fallback: se a chave nao existir na tabela, vale o
 * valor de ambiente. Assim a plataforma sobe com a tabela vazia e a primeira
 * gravacao no painel passa a mandar — sem migracao de dados nem redeploy.
 *
 * ATENCAO: alterar um percentual aqui NAO recalcula venda ja realizada. O
 * percentual e copiado para o ativo e congelado no repasse no momento da venda
 * (secao 8 do documento). Esta funcao so muda o padrao dos proximos.
 */
const CHAVE_DO_SPLIT = Object.fromEntries(
  Object.values(MODELOS_COMERCIAIS).map((m) => [m, `split.${m}.fornecedor`])
);

const PADROES = {
  "split.estoque.fornecedor": {
    valor: () => env.business.splitSupplier.estoque,
    descricao: "Percentual do fornecedor no modelo RED Estoque.",
  },
  "split.catalogo.fornecedor": {
    valor: () => env.business.splitSupplier.catalogo,
    descricao: "Percentual do fornecedor no modelo RED Catálogo.",
  },
  "split.proprio.fornecedor": {
    valor: () => env.business.splitSupplier.proprio,
    descricao:
      "Percentual do fornecedor no modelo Ativo Próprio RED. Zero por definição: o ativo é da RED e não há terceiro a repassar.",
  },
  "repasse.prazoHoras": {
    valor: () => PRAZO_REPASSE_HORAS,
    descricao: "Prazo de repasse após a conclusão integral da operação.",
  },
  "repasse.alertaHoras": {
    valor: () => 24,
    descricao: "Antecedência com que o painel destaca um repasse como urgente.",
  },
  "notificacoes.canal": {
    valor: () => "painel-email",
    descricao: "Canais de notificação ativos. Push e SMS não fazem parte da V1.",
  },
  "notificacoes.remetente": {
    valor: () => env.mail.from,
    descricao: "Remetente dos e-mails transacionais.",
  },
};

/** Uma leitura, com fallback por chave. Nunca lanca — configuracao ausente
 *  nao pode impedir um calculo de acontecer. */
async function valor(chave) {
  const padrao = PADROES[chave];
  try {
    const linha = await db.Setting.findByPk(chave);
    if (linha) return linha.value;
  } catch {
    /* tabela indisponivel: cai no padrao */
  }
  return padrao ? padrao.valor() : null;
}

async function todas() {
  const linhas = await db.Setting.findAll({ raw: true });
  const guardadas = Object.fromEntries(linhas.map((l) => [l.key, l.value]));

  return Object.entries(PADROES).map(([chave, def]) => ({
    key: chave,
    value: guardadas[chave] !== undefined ? guardadas[chave] : def.valor(),
    description: def.descricao,
    // O painel mostra quais valores ja foram editados e quais ainda vem do
    // ambiente — sem isso o gestor nao sabe se um numero foi decidido ou herdado.
    origem: guardadas[chave] !== undefined ? "configurado" : "padrao",
  }));
}

async function gravar(entradas, { ator } = {}) {
  const chaves = Object.keys(entradas);
  const desconhecida = chaves.find((c) => !PADROES[c]);
  if (desconhecida) {
    const { AppError } = require("../../utils/app-error");
    throw AppError.badRequest(`Configuração desconhecida: ${desconhecida}.`, "UNKNOWN_SETTING", {
      disponiveis: Object.keys(PADROES),
    });
  }

  const antes = Object.fromEntries(await Promise.all(chaves.map(async (c) => [c, await valor(c)])));

  for (const chave of chaves) {
    await db.Setting.upsert({
      key: chave,
      value: entradas[chave],
      description: PADROES[chave].descricao,
      updatedBy: ator?.id || null,
    });
  }

  await audit.registrar({
    entity: "user",
    entityId: ator?.id || null,
    action: "configuracao",
    antes,
    depois: entradas,
    ator,
    notes: "Alteração de configuração da plataforma. Não recalcula vendas já realizadas.",
  });

  return todas();
}

/**
 * Percentual do fornecedor para um modelo comercial, ja com fallback.
 *
 * A chave e derivada do modelo em vez de escolhida num ternario: com dois
 * modelos o ternario funcionava, com o terceiro ele mandava silenciosamente
 * o ativo proprio para o percentual do catalogo — 65% para um fornecedor que
 * nao existe. Modelo desconhecido cai no catalogo, que e o mais conservador
 * para a RED (repassa mais, nunca retem a mais do que devia).
 */
async function percentualDoModelo(modelo) {
  const chave = CHAVE_DO_SPLIT[modelo];
  const v = Number(await valor(chave || "split.catalogo.fornecedor"));
  return Number.isFinite(v) ? v : env.business.splitSupplier.catalogo;
}

module.exports = { valor, todas, gravar, percentualDoModelo, PADROES };
