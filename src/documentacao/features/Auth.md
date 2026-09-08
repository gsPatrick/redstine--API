# Auth

Base: `/api/v1/auth` · Rate limit próprio: 20 req / 15 min

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/register` | — | Registo público (só `comprador` ou `fornecedor`) |
| POST | `/login` | — | Devolve utilizador + token |
| GET | `/me` | Bearer | Utilizador do token |
| PATCH | `/password` | Bearer | Troca de senha |
| POST | `/forgot-password` | — | Pede link de recuperação |
| POST | `/reset-password` | — | Redefine com o token do e-mail |

## Registo

```json
POST /api/v1/auth/register
{ "name": "Maria Silva", "email": "maria@example.com",
  "password": "senha-forte-123", "role": "fornecedor", "company": "Construtora X" }
```

`role` é o único campo com regra especial: qualquer valor diferente de
`fornecedor` vira `comprador`. **Não é possível criar admin por esta rota** —
mesmo mandando `"role": "admin"`.

## Login

```json
POST /api/v1/auth/login
{ "email": "maria@example.com", "password": "senha-forte-123" }
```

```json
{ "data": { "user": { "id": "...", "role": "fornecedor" }, "token": "eyJ..." } }
```

Use em `Authorization: Bearer <token>`.

## Erros

| Código | HTTP | Quando |
|---|---|---|
| `EMAIL_IN_USE` | 409 | E-mail já cadastrado |
| `INVALID_CREDENTIALS` | 401 | E-mail ou senha errados |
| `USER_INACTIVE` | 403 | Conta não está `ativo` |
| `TOKEN_MISSING` | 401 | Sem header `Authorization` |
| `INVALID_TOKEN` / `TOKEN_EXPIRED` | 401 | Token inválido ou vencido |
| `WRONG_PASSWORD` | 400 | Senha atual errada na troca |
| `RATE_LIMITED` | 429 | Mais de 20 tentativas em 15 min |

**Nota de segurança:** e-mail inexistente e senha errada devolvem a mesma
mensagem e o mesmo código. É deliberado — resposta diferente permitiria
descobrir quais e-mails estão cadastrados.

## Recuperação de senha

```
POST /auth/forgot-password   { "email": "maria@example.com" }
POST /auth/reset-password    { "token": "...", "newPassword": "nova-senha-123" }
```

Três decisões:

**Só o hash do token vai para a base.** O valor em claro existe apenas no
e-mail — quem ler a base não assume conta de ninguém.

**A resposta é sempre a mesma**, exista ou não a conta. Mesma razão do login.

**Um link ativo por vez:** pedir de novo invalida os anteriores. O token expira
em `RESET_TOKEN_TTL_MINUTES` (padrão 60) e só serve uma vez.

| Código | HTTP | Quando |
|---|---|---|
| `INVALID_RESET_TOKEN` | 400 | Token inexistente, expirado ou já usado |
