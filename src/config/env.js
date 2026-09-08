"use strict";

require("dotenv").config();

/**
 * Ponto unico de leitura de process.env. Nenhum outro ficheiro le variaveis de
 * ambiente diretamente — assim uma variavel nova aparece aqui, no .env.example
 * e na documentacao, e nao espalhada pelo codigo.
 */
const bool = (value, fallback = false) => {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const int = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const list = (value, fallback = []) =>
  value ? String(value).split(",").map((s) => s.trim()).filter(Boolean) : fallback;

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: (process.env.NODE_ENV || "development") === "production",

  app: {
    port: int(process.env.APP_PORT, 4000),
    apiPrefix: process.env.APP_API_PREFIX || "/api",
    // Usado para montar links nos e-mails.
    siteUrl: (process.env.APP_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
    publicUrl: (process.env.APP_PUBLIC_URL || "http://localhost:4000").replace(/\/$/, ""),
  },

  db: {
    host: process.env.DB_HOST || "localhost",
    port: int(process.env.DB_PORT, 5432),
    name: process.env.DB_NAME || "red_api",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    ssl: bool(process.env.DB_SSL, false),
    logging: bool(process.env.DB_LOGGING, false),
  },

  jwt: {
    secret: process.env.JWT_SECRET || "",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },

  auth: {
    resetTokenTtlMinutes: int(process.env.RESET_TOKEN_TTL_MINUTES, 60),
  },

  mail: {
    // Sem MAIL_HOST o mailer escreve no stdout em vez de enviar.
    host: process.env.MAIL_HOST || "",
    port: int(process.env.MAIL_PORT, 587),
    secure: bool(process.env.MAIL_SECURE, false),
    user: process.env.MAIL_USER || "",
    password: process.env.MAIL_PASSWORD || "",
    from: process.env.MAIL_FROM || "RED <nao-responda@redestine.com.br>",
  },

  upload: {
    dir: process.env.UPLOAD_DIR || "uploads",
    maxFileSizeMb: int(process.env.UPLOAD_MAX_FILE_MB, 8),
    allowedMime: list(process.env.UPLOAD_ALLOWED_MIME, [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
    ]),
  },

  cors: {
    /**
     * Origens permitidas.
     *
     * `APP_SITE_URL` entra automaticamente: se a API sabe onde o site está —
     * usa esse endereço para montar os links dos e-mails —, recusar chamadas
     * vindas de lá seria contraditório. Isso evita o erro mais comum do
     * deploy: subir tudo e o painel falhar por CORS porque faltou repetir o
     * mesmo domínio numa segunda variável.
     *
     * `CORS_ORIGINS=*` libera qualquer origem. Ver src/middlewares/cors.js
     * para o que isso significa e quando deixa de ser aceitável.
     */
    origins: [
      ...list(process.env.CORS_ORIGINS, ["http://localhost:3000"]),
      (process.env.APP_SITE_URL || "").replace(/\/$/, ""),
    ].filter(Boolean),
  },

  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: int(process.env.RATE_LIMIT_MAX, 300),
  },

  payments: {
    /**
     * Provider do gateway. `manual` e o default e nao e um placeholder morto:
     * e o modo em que a RED opera hoje — PIX e boleto conferidos a mao pelo
     * financeiro. Trocar para um PSP e mudar esta variavel, nao o dominio.
     */
    provider: process.env.PAYMENT_PROVIDER || "manual",
    apiKey: process.env.PAYMENT_API_KEY || "",
    apiUrl: (process.env.PAYMENT_API_URL || "").replace(/\/$/, ""),
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || "",
    // Custodia: a RED recebe o total e repassa apos a conclusao da operacao.
    // Split automatico no ato da compra contradiz a regra das 48h, que so
    // libera o valor do fornecedor apos a retirada confirmada.
    modo: process.env.PAYMENT_MODE || "custodia",
    metodos: list(process.env.PAYMENT_METHODS, ["pix", "boleto", "cartao"]),
    pixExpiraMinutos: int(process.env.PAYMENT_PIX_EXPIRES_MINUTES, 60),
    boletoDiasVencimento: int(process.env.PAYMENT_BOLETO_DUE_DAYS, 3),
  },

  business: {
    // Repasse ao fornecedor por modelo comercial (o resto fica com a RED).
    splitSupplier: {
      estoque: int(process.env.SPLIT_ESTOQUE_SUPPLIER, 50),
      catalogo: int(process.env.SPLIT_CATALOGO_SUPPLIER, 65),
    },
  },
};

/** Falha cedo e com mensagem clara em vez de erro obscuro no primeiro request. */
function assertEnv() {
  const faltando = [];
  if (!env.jwt.secret) faltando.push("JWT_SECRET");
  if (env.isProduction && env.jwt.secret.length < 32) {
    faltando.push("JWT_SECRET (minimo 32 caracteres em producao)");
  }
  // Gateway real sem credencial falha no primeiro checkout, nao no boot —
  // por isso a checagem sobe para aqui.
  if (env.payments.provider !== "manual") {
    if (!env.payments.apiKey) faltando.push("PAYMENT_API_KEY");
    if (env.isProduction && !env.payments.webhookSecret) {
      faltando.push("PAYMENT_WEBHOOK_SECRET (obrigatorio em producao)");
    }
  }

  if (faltando.length) {
    throw new Error(
      `Variaveis de ambiente obrigatorias ausentes ou invalidas: ${faltando.join(", ")}. ` +
        "Consulte .env.example e src/documentacao/ENV_REFERENCE.md."
    );
  }
}

module.exports = { env, assertEnv };
