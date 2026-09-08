# Middlewares

Ordem em `app.js`: `helmet` → `cors` → parsers → `morgan` → rotas com
`apiLimiter` → `notFoundHandler` → `errorHandler`.

## auth.js

| Export | Uso |
|---|---|
| `requireAuth` | Exige token. Carrega `req.user` |
| `optionalAuth` | Carrega `req.user` se houver token; nunca bloqueia |
| `requireRole(...papeis)` | Restringe por papel. Sempre **depois** de `requireAuth` |

`optionalAuth` existe para rotas públicas que ganham contexto quando há sessão:
envio de ativos, criação de pedido e cotação funcionam anônimos, mas vinculam ao
utilizador quando ele está autenticado.

Conta com `status` diferente de `ativo` recebe 403 mesmo com token válido.

## validate.js

`validate({ body, query, params })` com Zod. Substitui o valor original pelo
resultado parseado — o controller recebe dados já normalizados e com tipo
convertido (`z.coerce.number()` nos filtros de query).

Falha devolve `422 VALIDATION_ERROR` com `details: [{ campo, motivo }]`.

## error-handler.js

Ponto único de tradução de erro. Converte erros do Sequelize para o contrato
público:

| Erro Sequelize | Vira |
|---|---|
| `UniqueConstraintError` | `409 UNIQUE_VIOLATION` |
| `ValidationError` | `422 VALIDATION_ERROR` |
| `ForeignKeyConstraintError` | `400 FK_VIOLATION` |
| `DatabaseError` | `500 DB_ERROR` |

Erros de JWT viram `401 INVALID_TOKEN` / `TOKEN_EXPIRED`.

Em produção, 500 devolve mensagem genérica e omite o stack — detalhe interno não
vaza para o cliente. 5xx sempre sai em `console.error`.

## rate-limit.js

| Limitador | Janela | Máximo | Onde |
|---|---|---|---|
| `apiLimiter` | 15 min | 300 | Todas as rotas |
| `authLimiter` | 15 min | 20 | `/auth/register` e `/auth/login` |

O limite apertado no auth é contra força bruta.

## cors.js

Allowlist explícita por `CORS_ORIGINS`. Requisição sem `Origin` (curl,
server-to-server) passa; origem fora da lista é recusada.
