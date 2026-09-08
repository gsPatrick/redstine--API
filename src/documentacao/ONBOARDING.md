# Onboarding

## Requisitos

- Node.js 18+ (testado em 24)
- PostgreSQL 14+ (testado em 16)

## Subir local

```bash
npm install
cp .env.example .env        # depois preencha JWT_SECRET
createdb red_api
npm run migrate
npm run seed
npm run dev                 # http://localhost:4000/api
```

### Gerar um JWT_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

A aplicação **recusa arrancar** sem `JWT_SECRET`. É de propósito: melhor falhar
no arranque com mensagem clara do que aceitar token assinado com segredo vazio.

## Primeiro utilizador

O `npm run seed` cria o admin e o catálogo (3 categorias, 15 subcategorias):

```
admin@redestine.com.br / RedAdmin2026!
```

Sobrescreva com `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`. **Troque a senha
depois do primeiro acesso.** O seed é idempotente.

## Verificar que está tudo de pé

```bash
npm run smoke:test
```

Percorre o fluxo real — envio → curadoria → aprovação → publicação → pedido →
confirmação → cotação — e verifica também as recusas esperadas.

```bash
curl localhost:4000/api/v1/ping        # { status, db, time }
curl localhost:4000/api/health         # liveness
```

## Migrations

```bash
npm run migrate
npm run migrate:undo
npx sequelize-cli migration:generate --name descricao-curta
```

Nunca altere só o model: o schema vem da migration. Model e migration
divergentes é a origem de "funciona local, quebra em produção".

## Onde estão os logs

`morgan` em stdout — `dev` em desenvolvimento, `combined` em produção. Erros 5xx
saem com stack em `console.error`. Não há ficheiro de log: em produção, capture
o stdout pelo orquestrador.
