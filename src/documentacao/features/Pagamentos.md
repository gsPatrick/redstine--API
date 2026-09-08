# Pagamentos e checkout

Base: `/api/v1/payments`.

## Custódia, não split automático

A RED recebe o valor **integral** e repassa o fornecedor depois. Split no ato da
compra entregaria dinheiro ao fornecedor antes da retirada — e a regra oficial é
que o valor só se torna devido após a **conclusão integral da operação**, com 48h
de prazo a partir dali. Um estorno antes da retirada, com split já executado,
viraria cobrança manual contra o fornecedor.

`PAYMENT_MODE=custodia` é o default e o modo coerente com a regra financeira.

## Camada de provider

O domínio nunca fala com um PSP: fala com `src/providers/payments`. Escolher entre
Mercado Pago, Asaas ou Pagar.me é criar um ficheiro novo ali e mudar
`PAYMENT_PROVIDER` — nenhum service de pedido é tocado.

Contrato que todo provider cumpre:
```
criarCobranca({ order, metodo, pagador }) -> { providerId, metodo, status, valor,
                                               expiraEm, pix?, boleto?, checkoutUrl? }
consultarCobranca(providerId)             -> { providerId, status, pagoEm }
cancelarCobranca(providerId)              -> { providerId, status }
validarWebhook(req)                       -> { valido, motivo? }
interpretarWebhook(corpo)                 -> { providerId, referencia, status, pagoEm }
```
`status` é sempre um `PAYMENT_STATUS` já traduzido: o vocabulário de cada PSP
morre dentro do seu próprio ficheiro.

### `manual` (default)
Não é placeholder morto — é como a RED opera hoje: gera a instrução de pagamento
e deixa a confirmação com o financeiro (`PATCH /orders/:id/payment`). Não inventa
QR Code nem linha digitável; emitir um código que nenhum banco reconhece seria
pior do que não emitir nenhum.

## Endpoints

| Rota | Acesso |
|---|---|
| `GET /methods` | público — o front usa para montar o checkout |
| `POST /orders/:orderId/checkout` | auth opcional (compra de convidado) |
| `GET /orders/:orderId/status` | auth opcional |
| `POST /webhook` | assinatura do PSP, sem token |

O webhook fica fora da autenticação por token: quem autentica é a assinatura,
verificada dentro do provider. É **idempotente** — evento repetido não gera duas
confirmações nem dois repasses — e responde `200 { ignorado: true }` para pedido
não localizado, porque erro faria o PSP reenviar para sempre um evento sem dono.

## Variáveis

`PAYMENT_PROVIDER`, `PAYMENT_API_KEY`, `PAYMENT_API_URL`, `PAYMENT_WEBHOOK_SECRET`,
`PAYMENT_MODE`, `PAYMENT_METHODS`, `PAYMENT_PIX_EXPIRES_MINUTES`,
`PAYMENT_BOLETO_DUE_DAYS`.

Com provider diferente de `manual`, o boot exige `PAYMENT_API_KEY` — e, em
produção, `PAYMENT_WEBHOOK_SECRET`. Falha no boot, não no primeiro checkout.

## Pendente com o cliente

A escolha do PSP. O único ponto que exige decisão é se o adquirente aceita
custódia (recebimento em conta RED com repasse posterior) — alguns empurram split
automático, que não cabe na regra das 48h.
