# Orders — compra direta

Base: `/api/v1/orders`

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/` | opcional | Cria pedido (checkout aberto) |
| GET | `/reference/:reference` | — | Acompanhar pela referência |
| GET | `/` | interno | Lista |
| GET | `/:id` | interno | Detalhe |
| POST | `/:id/confirm` | interno | **Confirma e baixa estoque** |
| PATCH | `/:id/status` | interno | Demais transições |

## Criar

```json
POST /api/v1/orders
{
  "buyerName": "João Souza", "buyerEmail": "joao@example.com",
  "paymentMethod": "pix",
  "items": [{ "assetId": "uuid", "quantity": 2 }]
}
```

```json
{ "data": { "reference": "RED-A7K3QP", "status": "aguardando_confirmacao", "total": "37.00" } }
```

O comprador não precisa de conta. Se houver token, o pedido fica vinculado.

## Os dois passos

Criar **não** reserva nada — regra nº 4. A quantidade só baixa em
`POST /:id/confirm`, que roda em transação com `SELECT ... FOR UPDATE` nos
ativos. Se a quantidade chega a zero, o ativo passa a `vendido`.

Confirmar por `PATCH /:id/status` é bloqueado de propósito
(`USE_CONFIRM_ENDPOINT`): esse caminho não baixaria estoque.

## Snapshot

`OrderItem` guarda `nameSnapshot`, `unitPrice` e `marketPriceSnapshot`. O
histórico do pedido não muda quando o catálogo muda.

## Frete

Não existe. `total === subtotal`. Retirada e transporte são combinados à parte
e anotados em `pickupNotes` — regra nº 6.

## Erros

| Código | HTTP | Quando |
|---|---|---|
| `ASSET_UNAVAILABLE` | 422 | Ativo saiu do ar entre criar e confirmar |
| `QUOTE_REQUIRED` | 422 | Item é `sob consulta` — abra uma cotação |
| `PRICE_MISSING` | 422 | Ativo sem preço |
| `INSUFFICIENT_QUANTITY` | 422 | Quantidade acima do disponível |
| `INVALID_ORDER_STATUS` | 422 | Confirmar um pedido já confirmado |
| `USE_CONFIRM_ENDPOINT` | 400 | Tentou confirmar pelo `/status` |
