# Quotes — sob consulta

Base: `/api/v1/quotes`

Existe por causa da regra nº 5: grandes lotes, equipamentos e ativos volumosos
não viram pedido direto. E por causa da regra nº 4: **abrir cotação não reserva
nada** — nenhuma quantidade é baixada aqui.

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/` | opcional | Abre cotação |
| GET | `/` | interno | Lista |
| GET | `/:id` | interno | Detalhe |
| POST | `/:id/respond` | interno | Responde com preço e condições |
| PATCH | `/:id/status` | interno | Aceita, recusa, fecha |

```json
POST /api/v1/quotes
{ "assetId": "uuid", "buyerName": "Ana Lima", "buyerEmail": "ana@example.com",
  "quantity": 500, "message": "Preciso de volume maior." }
```

```json
{ "data": { "reference": "COT-9XM2TB", "status": "nova" } }
```

## Estados

`nova` → `em_atendimento` → `respondida` → `encerrada`

Vocabulário oficial do documento (seção 10). O anterior (`aberta`, `em_analise`,
`aceita`, `recusada`, `fechada`) foi migrado em
`20260908100000-eventos-auditoria-notificacoes`.

`respondida` é atingido por `POST /:id/respond` (grava `quotedPrice`,
`responseNotes` e `respondedAt`). Consulta `encerrada` não aceita nova resposta
(`QUOTE_CLOSED`).

## Responsável pelo atendimento

`POST /:id/assign` com `{ "assignedTo": "uuid" }`. Atribuir tira a consulta da
fila: `nova` passa automaticamente a `em_atendimento` — consulta com dono não é
consulta não lida.

## Acesso

Por **capacidade**, não por papel: leitura exige `commercial_read`, e responder,
atribuir ou mudar status exige `commercial_write`. O time comercial atende
consultas tanto quanto a curadoria, e amarrar a rota a uma lista de papéis
obrigaria a editar código toda vez que o organograma muda.

## Erros

| Código | HTTP | Quando |
|---|---|---|
| `ASSET_NOT_FOUND` | 404 | Ativo não existe |
| `ASSET_UNAVAILABLE` | 422 | Ativo não está publicado |
| `QUOTE_NOT_FOUND` | 404 | Cotação não existe |
| `QUOTE_CLOSED` | 422 | Já encerrada |
