# API da RED — documentação

> Comece por aqui.

A RED é uma **plataforma de circulação de ativos**: recebe materiais,
equipamentos e mobiliário de fornecedores, avalia por curadoria própria e
comercializa em catálogo. Não é depósito, revenda, ferro-velho nem brechó — e
essa distinção tem consequências no modelo de dados.

## Índice

| Documento | Para quê |
|---|---|
| [ONBOARDING.md](./ONBOARDING.md) | rodar local, migrar, primeiro utilizador |
| [MAPA-TELAS-API.md](./MAPA-TELAS-API.md) | **tela do front → endpoint** — comece aqui para integrar |
| [ENV_REFERENCE.md](./ENV_REFERENCE.md) | todas as variáveis de ambiente |
| [features/Regras-de-Negocio.md](./features/Regras-de-Negocio.md) | **as invariantes do domínio** |
| [features/Auth.md](./features/Auth.md) | autenticação e papéis |
| [features/Catalog.md](./features/Catalog.md) | categorias e subcategorias |
| [features/Assets.md](./features/Assets.md) | ativos, ciclo de vida, catálogo público |
| [features/Submissions.md](./features/Submissions.md) | envio de ativos (página Vender) |
| [features/Evaluations.md](./features/Evaluations.md) | curadoria |
| [features/Orders.md](./features/Orders.md) | compra direta |
| [features/Quotes.md](./features/Quotes.md) | sob consulta |
| [features/Wishlist.md](./features/Wishlist.md) | favoritos |
| [features/Financeiro.md](./features/Financeiro.md) | **a regra financeira-mestre** — leia antes de tocar em valor |
| [features/Payouts.md](./features/Payouts.md) | repasse ao fornecedor |
| [features/Me.md](./features/Me.md) | área do utilizador |
| [features/Pagamentos.md](./features/Pagamentos.md) | checkout, gateway e webhook |
| [features/Painel-Gestao.md](./features/Painel-Gestao.md) | dashboard: estado x fluxo |
| [features/Rastreamento.md](./features/Rastreamento.md) | eventos, auditoria e notificações |
| [features/Uploads.md](./features/Uploads.md) | imagens |
| [middlewares/README.md](./middlewares/README.md) | auth, validação, erros, rate limit |
| [models/README.md](./models/README.md) | contrato campo a campo |

## Arquitetura em uma frase

`routes → controller → service → (provider)`

O **controller** só lida com HTTP. O **service** guarda a regra de negócio e
abre transação quando precisa. Integração externa nunca é chamada do
controller — vive em `src/providers/`.

## Mapa das pastas

```
app.js                    entrada: Express, middlewares, rotas, erro global
migrations/               esquema versionado
scripts/                  seed.js e smoke.js
src/
  config/                 env, database, constants (vocabulário do domínio)
  models/                 um ficheiro por entidade + index.js (associações)
  features/<nome>/        routes · controller · service · schemas
  routes/index.js         único agregador da v1
  middlewares/            auth, validate, cors, rate-limit, error-handler
  providers/              mailer, storage, payments — sistemas externos
  utils/                  helpers puros
  documentacao/           este diretório
```

## Versionamento

Tudo sob `/api/v1`. Mudança que quebre contrato entra em `/v2` — não se altera
o comportamento da v1 em silêncio.

## Formato de resposta

Sucesso: `{ "data": ... }` — com `{ "data": [...], "meta": {...} }` quando pagina.
Erro: `{ "error": { "code": "...", "message": "...", "details": [...] } }`

O `code` é estável; ramifique por ele, não pela mensagem.

