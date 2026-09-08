# Variáveis de ambiente

Todas são lidas num único ponto: `src/config/env.js`. Nenhum outro ficheiro toca
em `process.env` — variável nova aparece aqui, no `.env.example` e neste
documento.

## Aplicação

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `NODE_ENV` | não | `development` | `development` \| `production` \| `test` |
| `APP_PORT` | não | `4000` | Porta HTTP |
| `APP_API_PREFIX` | não | `/api` | Prefixo das rotas. A versão (`/v1`) vem depois |

## Banco

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `DB_HOST` | não | `localhost` | |
| `DB_PORT` | não | `5432` | |
| `DB_NAME` | não | `red_api` | |
| `DB_USER` | não | `postgres` | |
| `DB_PASSWORD` | não | vazio | |
| `DB_SSL` | não | `false` | `true` em provedores geridos |
| `DB_LOGGING` | não | `false` | Ecoa SQL — útil para depurar |

## Autenticação

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `JWT_SECRET` | **sim** | — | Mínimo 32 caracteres em produção. A app não arranca sem |
| `JWT_EXPIRES_IN` | não | `7d` | Validade do token |

Gerar: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## CORS e limites

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `CORS_ORIGINS` | não | `http://localhost:3000` | Lista separada por vírgula. Allowlist explícita |
| `RATE_LIMIT_WINDOW_MS` | não | `900000` | Janela (15 min) |
| `RATE_LIMIT_MAX` | não | `300` | Requisições por janela. `/auth` tem limite próprio de 20 |

## Regras de negócio

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `SPLIT_ESTOQUE_SUPPLIER` | não | `50` | % ao fornecedor no modelo RED Estoque |
| `SPLIT_CATALOGO_SUPPLIER` | não | `65` | % ao fornecedor no modelo RED Catálogo |

Estão em ambiente porque são condição comercial, não constante técnica — mudam
sem deploy de código.

## E-mail

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `MAIL_HOST` | não | vazio | **Vazio = modo log**: as mensagens saem no stdout em vez de serem enviadas |
| `MAIL_PORT` | não | `587` | |
| `MAIL_SECURE` | não | `false` | `true` para porta 465 |
| `MAIL_USER` | não | vazio | |
| `MAIL_PASSWORD` | não | vazio | |
| `MAIL_FROM` | não | `RED <nao-responda@redestine.com.br>` | Remetente |

O modo log é deliberado: permite construir e testar todo o fluxo de notificação
sem depender de credenciais. Com `MAIL_HOST` definido é preciso
`npm install nodemailer` — a dependência não vem por omissão.

## Upload

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `UPLOAD_DIR` | não | `uploads` | Pasta em disco. Também é o prefixo da URL pública |
| `UPLOAD_MAX_FILE_MB` | não | `8` | Tamanho máximo por ficheiro |
| `UPLOAD_ALLOWED_MIME` | não | `image/jpeg,image/png,image/webp,image/avif` | Tipos aceites |

## URLs públicas

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `APP_SITE_URL` | não | `http://localhost:3000` | Front — usado nos links dos e-mails |
| `APP_PUBLIC_URL` | não | `http://localhost:4000` | Esta API — usada nas URLs das imagens |

## Recuperação de senha

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `RESET_TOKEN_TTL_MINUTES` | não | `60` | Validade do link |

## Seed (só scripts)

| Variável | Padrão |
|---|---|
| `SEED_ADMIN_EMAIL` | `admin@redestine.com.br` |
| `SEED_ADMIN_PASSWORD` | `RedAdmin2026!` |

## Exemplo seguro

Veja `.env.example` na raiz — sem valores reais.

## Pagamentos

| Variável | Default | Para quê |
|---|---|---|
| `PAYMENT_PROVIDER` | `manual` | qual gateway usar. `manual` = PIX/boleto conferidos pelo financeiro |
| `PAYMENT_API_KEY` | — | credencial do PSP. **Obrigatória** se o provider não for `manual` |
| `PAYMENT_API_URL` | — | base da API do PSP |
| `PAYMENT_WEBHOOK_SECRET` | — | segredo da assinatura do webhook. **Obrigatória em produção** com PSP real |
| `PAYMENT_MODE` | `custodia` | `custodia` (RED recebe e repassa depois) ou `split` |
| `PAYMENT_METHODS` | `pix,boleto,cartao` | métodos habilitados no checkout |
| `PAYMENT_PIX_EXPIRES_MINUTES` | `60` | validade da cobrança PIX |
| `PAYMENT_BOLETO_DUE_DAYS` | `3` | vencimento do boleto |

`PAYMENT_MODE=split` existe como opção, mas contradiz a regra das 48h: o valor do
fornecedor só se torna devido após a conclusão integral da operação. Ver
[features/Pagamentos.md](./features/Pagamentos.md).
