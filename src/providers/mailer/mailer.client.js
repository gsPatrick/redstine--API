"use strict";

const { env } = require("../../config/env");

/**
 * Cliente de e-mail.
 *
 * Hoje existe em dois modos:
 *  - `log`  (padrao em desenvolvimento) — escreve no stdout em vez de enviar
 *  - `smtp` — envia de verdade, quando MAIL_HOST estiver configurado
 *
 * O modo `log` e deliberado: permite construir e testar todo o fluxo de
 * notificacao sem depender de credenciais de e-mail. Trocar por SendGrid,
 * Resend ou SES e substituir apenas `enviarPorSmtp` — nenhum service muda.
 */

async function enviarPorLog({ to, subject, text }) {
  console.log("\n[mail] ------------------------------");
  console.log(`[mail] para:    ${to}`);
  console.log(`[mail] assunto: ${subject}`);
  console.log(`[mail] corpo:\n${text}`);
  console.log("[mail] ------------------------------\n");
  return { entregue: true, modo: "log" };
}

async function enviarPorSmtp(mensagem) {
  // nodemailer nao esta instalado por omissao — so e exigido em quem usa SMTP.
  let nodemailer;
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    nodemailer = require("nodemailer");
  } catch {
    console.warn("[mail] MAIL_HOST definido mas 'nodemailer' nao instalado; a cair para log.");
    return enviarPorLog(mensagem);
  }

  const transporte = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.secure,
    auth: env.mail.user ? { user: env.mail.user, pass: env.mail.password } : undefined,
  });

  await transporte.sendMail({
    from: env.mail.from,
    to: mensagem.to,
    subject: mensagem.subject,
    text: mensagem.text,
    html: mensagem.html,
  });

  return { entregue: true, modo: "smtp" };
}

async function enviar(mensagem) {
  try {
    return env.mail.host ? await enviarPorSmtp(mensagem) : await enviarPorLog(mensagem);
  } catch (err) {
    // Notificacao nunca derruba a operacao: o pedido foi criado mesmo que o
    // e-mail falhe. Fica registrado para investigacao.
    console.error("[mail] falha ao enviar:", err.message);
    return { entregue: false, erro: err.message };
  }
}

module.exports = { enviar };
