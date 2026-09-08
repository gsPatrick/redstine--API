# Regras de negócio

Este é o documento mais importante da pasta. Cada regra abaixo é uma afirmação
pública do site da RED que foi traduzida em invariante de código — e o
`npm run smoke:test` verifica todas elas.

---

## 1. Fornecedor não publica direto

> "Fornecedores não publicam diretamente. Cada ativo é avaliado antes de
> integrar o catálogo."

**No código:** não existe caminho que crie um `Asset` publicado. Todo ativo
nasce em `rascunho` (via `/assets`) ou em `aguardando_aprovacao` (via curadoria).
O `status` só muda pelo service `mudarStatus`, que valida a transição.

## 2. Nenhum ativo é comercializado por preço não autorizado

**No código:** publicar exige `supplierApprovedAt` preenchido. A tentativa
devolve `422 SUPPLIER_APPROVAL_REQUIRED`.

Consequência menos óbvia: **alterar preço ou modelo comercial de um ativo já
aprovado limpa a aprovação** e devolve o ativo para `aguardando_aprovacao`. O
fornecedor aprovou aqueles números, não outros.

## 3. O envio não garante a publicação

> "O envio não garante a publicação. Todos os ativos passam por avaliação antes
> de integrar o catálogo."

**No código:** `POST /submissions` cria apenas uma `Submission` em `recebida`.
Nunca cria `Asset`. O ativo só nasce dentro de `evaluations.service.avaliar`,
com `approved: true` — e dentro de uma transação, junto com o registro da
avaliação.

## 4. Demonstrar interesse não é reserva

> "O envio de interesse não caracteriza reserva automática."

**No código:** `POST /orders` cria o pedido em `aguardando_confirmacao` e **não
baixa quantidade**. A baixa só acontece em `POST /orders/:id/confirm`, com
`SELECT ... FOR UPDATE` nos ativos para evitar corrida entre dois compradores.

Enquanto o pedido não é confirmado, o ativo continua disponível para outros.

## 5. Sob consulta não vira pedido

> "Para grandes lotes, equipamentos, ativos volumosos ou operações sujeitas a
> confirmação ou logística especial."

**No código:** ativo com `saleMode: "consulta"` dentro de um pedido devolve
`422 QUOTE_REQUIRED`. O caminho correto é `POST /quotes`.

## 6. Retirada e transporte são confirmados à parte

> "Custos e responsabilidades de retirada, carregamento, transporte ou entrega
> devem ser confirmados antes da conclusão da compra."

**No código:** o pedido não tem frete. `total === subtotal`, e existe
`pickupNotes` para registrar o que foi combinado.

## 7. Até 50% do preço de mercado

O ativo tem **dois preços**: `price` (o praticado) e `marketPrice` (a referência
de mercado). A API devolve `discountPercent` já calculado — o cliente não refaz
a conta, e a promessa da home fica verificável a partir do dado.

Sem `marketPrice` não há desconto: `discountPercent` vem `null`.

## 8. A RED não é só construção

O acervo é desbalanceado por natureza (construção domina). `GET /assets/featured`
**intercala as categorias** em vez de ordenar por data, senão a vitrine enche de
uma categoria só.

---

## Ciclo de vida do ativo

```
rascunho ──► em_avaliacao ──► aguardando_aprovacao ──► aprovado ──► publicado ──► vendido
    │              │                    │                  │            │            │
    └──────────────┴────────────────────┴──────────────────┴────────────┴───► inativo
```

Transições permitidas em `src/config/constants.js` → `ASSET_TRANSICOES`.
Qualquer salto fora do mapa devolve `422 INVALID_TRANSITION` com os destinos
válidos em `details`.

## Modelos comerciais

| Modelo | Onde fica o ativo | Fornecedor | RED |
|---|---|---|---|
| `estoque` | estoque da RED | 50% | 50% |
| `catalogo` | com o fornecedor | 65% | 35% |

Percentuais em `SPLIT_ESTOQUE_SUPPLIER` e `SPLIT_CATALOGO_SUPPLIER` — são
condição comercial, mudam sem deploy.

## Papéis

| Papel | Pode |
|---|---|
| `comprador` | comprar, cotar, ver o catálogo |
| `fornecedor` | enviar ativos, **aprovar preço e modelo dos seus** |
| `curador` | avaliar envios, gerir ativos, confirmar pedidos, responder cotações |
| `admin` | tudo, incluindo gestão de utilizadores |

O registo público (`POST /auth/register`) só cria `comprador` ou `fornecedor`.
`admin` e `curador` nascem por `POST /users`, que exige admin.
