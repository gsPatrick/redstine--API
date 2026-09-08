"use strict";

const db = require("../../models");
const { AppError } = require("../../utils/app-error");
const { gerarReferencia } = require("../../utils/reference");
const audit = require("../audit/audit.service");
const notificacoes = require("../notifications/notifications.service");
const mailer = require("../../providers/mailer");
const { SUBMISSION_STATUS } = require("../../config/constants");

/**
 * Enviar Ativos, a partir do painel.
 *
 * E um formulario DIFERENTE do da pagina Vender do site, e por isso tem rota
 * propria. Ali o visitante ainda nao tem conta e precisa se identificar (nome,
 * empresa, e-mail, telefone); aqui a identidade vem do token, e o que interessa
 * sao os dados do ativo: categoria, subcategoria, quantidade, condicao,
 * localizacao e fotos.
 *
 * O envio NAO publica nada. Nenhum ativo enviado aqui chega ao catalogo
 * sozinho — passa por curadoria, precificacao e aprovacao do proprio
 * fornecedor antes de ser publicado.
 */
async function enviar(userId, dados) {
  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound("Usuário não encontrado.", "USER_NOT_FOUND");

  if (dados.categoryId) {
    const cat = await db.Category.findByPk(dados.categoryId);
    if (!cat) throw AppError.badRequest("Categoria inválida.", "CATEGORY_INVALID");

    if (dados.subcategoryId) {
      const sub = await db.Subcategory.findByPk(dados.subcategoryId);
      if (!sub || sub.categoryId !== dados.categoryId) {
        throw AppError.badRequest(
          "Subcategoria não pertence à categoria informada.",
          "SUBCATEGORY_MISMATCH"
        );
      }
    }
  }

  const submission = await db.Submission.create({
    reference: gerarReferencia("ENV"),
    supplierId: userId,
    // Identidade vem do token, nunca do corpo: um fornecedor nao pode enviar
    // um ativo em nome de outro.
    name: [user.name, user.lastName].filter(Boolean).join(" "),
    company: user.companyTradeName || user.company,
    email: user.email,
    phone: user.phone || "",
    city: dados.local,
    assetType: dados.nome,
    description: dados.nome,
    approximateQuantity: `${dados.quantidade} ${dados.unidade || "unidade"}`,
    notes: dados.observacoes,
    photos: dados.fotos || [],
    authorized: true,
    status: SUBMISSION_STATUS.RECEBIDA,
    attributes: {
      categoryId: dados.categoryId || null,
      subcategoryId: dados.subcategoryId || null,
      condicao: dados.condicao || null,
      quantidade: dados.quantidade,
      unidade: dados.unidade || "unidade",
      local: dados.local,
      origem: "painel",
    },
  });

  mailer.envioRecebido(submission).catch(() => {});

  await audit.registrar({
    entity: "submission",
    entityId: submission.id,
    action: "cadastro",
    depois: { reference: submission.reference, origem: "painel" },
    ator: { id: userId },
  });

  notificacoes.notificarEquipe(notificacoes.GESTAO_COMERCIAL, notificacoes.TIPOS.NOVO_ENVIO, {
    reference: submission.reference,
    entity: "submission",
    entityId: submission.id,
  });

  return {
    id: submission.id,
    reference: submission.reference,
    status: submission.status,
    mensagem:
      "Ativo enviado para avaliação. A curadoria RED analisa procedência, condição, localização e potencial comercial; a publicação só acontece após a sua aprovação do preço e do modelo.",
  };
}

module.exports = { enviar };
