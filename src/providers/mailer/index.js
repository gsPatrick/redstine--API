"use strict";

const { enviar } = require("./mailer.client");
const { env } = require("../../config/env");
const { ROTULO_MODELO_COMERCIAL } = require("../../config/constants");

const linkSite = (caminho) => `${env.app.siteUrl}${caminho}`;

/** Cada funcao monta uma mensagem do dominio — o service nao escreve texto. */

const envioRecebido = (submission) =>
  enviar({
    to: submission.email,
    subject: `Recebemos seus ativos — ${submission.reference}`,
    text: [
      `Ola, ${submission.name}.`,
      "",
      "Recebemos o envio dos seus ativos para avaliacao.",
      `Referencia: ${submission.reference}`,
      "",
      "O envio nao garante a publicacao: cada ativo passa pela curadoria RED",
      "antes de integrar o catalogo. Avisaremos assim que houver decisao.",
      "",
      "Equipe RED",
    ].join("\n"),
  });

const ativoAguardandoAprovacao = (asset, fornecedor) =>
  enviar({
    to: fornecedor.email,
    subject: `Seu ativo foi aprovado na curadoria — falta sua aprovacao`,
    text: [
      `Ola, ${fornecedor.name}.`,
      "",
      `O ativo "${asset.name}" passou pela curadoria RED.`,
      "",
      `Preco proposto:  R$ ${asset.price}`,
      `Modelo comercial: ${ROTULO_MODELO_COMERCIAL[asset.commercialModel] || asset.commercialModel}`,
      "",
      "Nenhum ativo e comercializado por preco nao autorizado — por isso",
      "precisamos da sua aprovacao antes de publicar no catalogo.",
      "",
      linkSite("/my-account"),
      "",
      "Equipe RED",
    ].join("\n"),
  });

const pedidoRecebido = (order) =>
  enviar({
    to: order.buyerEmail,
    subject: `Pedido registrado — ${order.reference}`,
    text: [
      `Ola, ${order.buyerName}.`,
      "",
      `Seu pedido ${order.reference} foi registrado.`,
      `Total: R$ ${order.total}`,
      "",
      "O envio do pedido nao caracteriza reserva automatica: a RED confirma",
      "disponibilidade, quantidade e condicoes antes da conclusao.",
      "",
      "Custos e responsabilidades de retirada e transporte serao combinados",
      "com voce antes do fechamento.",
      "",
      "Equipe RED",
    ].join("\n"),
  });

const pedidoConfirmado = (order) =>
  enviar({
    to: order.buyerEmail,
    subject: `Pedido confirmado — ${order.reference}`,
    text: [
      `Ola, ${order.buyerName}.`,
      "",
      `Confirmamos seu pedido ${order.reference}.`,
      "Em seguida combinamos retirada e transporte.",
      "",
      "Equipe RED",
    ].join("\n"),
  });

const cotacaoRespondida = (quote) =>
  enviar({
    to: quote.buyerEmail,
    subject: `Resposta da sua consulta — ${quote.reference}`,
    text: [
      `Ola, ${quote.buyerName}.`,
      "",
      `Respondemos a consulta ${quote.reference}.`,
      quote.quotedPrice ? `Valor proposto: R$ ${quote.quotedPrice}` : "",
      quote.responseNotes || "",
      "",
      "Equipe RED",
    ]
      .filter(Boolean)
      .join("\n"),
  });

const recuperacaoDeSenha = (user, token) =>
  enviar({
    to: user.email,
    subject: "Recuperacao de senha — RED",
    text: [
      `Ola, ${user.name}.`,
      "",
      "Recebemos um pedido de recuperacao de senha para a sua conta.",
      "",
      linkSite(`/my-account/reset?token=${token}`),
      "",
      `O link expira em ${env.auth.resetTokenTtlMinutes} minutos e so pode ser usado uma vez.`,
      "Se nao foi voce, ignore este e-mail — a senha atual continua valida.",
      "",
      "Equipe RED",
    ].join("\n"),
  });

/** Mensagem livre — usada pelas notificacoes, que ja trazem titulo e corpo. */
const avulso = (mensagem) => enviar(mensagem);

module.exports = {
  avulso,
  envioRecebido,
  ativoAguardandoAprovacao,
  pedidoRecebido,
  pedidoConfirmado,
  cotacaoRespondida,
  recuperacaoDeSenha,
};
