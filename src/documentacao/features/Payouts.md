# Payouts — repasse ao fornecedor

Base: `/api/v1/payouts` · **Só `admin`** (curador avalia, não paga)

É aqui que o modelo comercial deixa de ser texto e vira número.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Lista, filtrável por `status` e `supplierId` |
| GET | `/supplier/:supplierId/summary` | Totais de um fornecedor |
| POST | `/mark-paid` | Marca pagos em lote (`{ ids, notes }`) |

O fornecedor vê os próprios em `GET /me/payouts` e `GET /me/summary`.

## Quando nasce

Na **confirmação do pedido**, dentro da mesma transação que baixa o estoque. Se
algo falhar, a confirmação inteira volta atrás — não fica venda sem repasse.

Um `Payout` por item, não por pedido: itens do mesmo pedido podem ter modelos
comerciais e fornecedores diferentes.

## O cálculo

| Modelo | Fornecedor | RED |
|---|---|---|
| RED Estoque | 50% | 50% |
| RED Catálogo | 65% | 35% |
| Ativo Próprio RED | 0% | 100% |

```js
supplierAmount = round(bruto * percent / 100)
redAmount      = bruto - supplierAmount   // por subtração, de propósito
```

A parte da RED sai por **subtração**, não por um segundo arredondamento. Com as
duas metades arredondadas em separado, R$ 0,01 dividido a 50% daria
0,01 + 0,01 = 0,02 — um centavo criado do nada. Há teste unitário para isso.

Os percentuais vêm de `SPLIT_ESTOQUE_SUPPLIER`, `SPLIT_CATALOGO_SUPPLIER` e
`SPLIT_PROPRIO_SUPPLIER`: são
condição comercial, mudam sem deploy. O percentual aplicado fica **gravado no
registro**, então mudar a variável não reescreve o histórico.

## Estados

`pendente` → `pago` · `pendente` → `cancelado`

Cancelar o pedido cancela os repasses pendentes dele, na mesma transação.

`POST /mark-paid` só afeta pendentes. Se nenhum id estiver pendente, devolve
`422 NO_PENDING_PAYOUTS` em vez de fingir sucesso.

## Resumo do fornecedor

```json
GET /api/v1/me/summary
{ "carteira": { "aReceber": 24.05, "jaPago": 0, "cancelado": 0,
                "quantidade": { "pendentes": 1, "pagos": 0 } } }
```

É o que alimenta "Valor a receber" e "Valor já pago" no painel.
