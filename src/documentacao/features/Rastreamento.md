# Rastreamento: eventos, auditoria e notificações

Princípio do briefing (seções 23 e 24): *"A V1 deve mostrar pouco, mas registrar
muito. Não podemos voltar no tempo para coletar dados que decidimos ignorar no
lançamento."* Por isso as três tabelas nascem completas mesmo com pouca tela
consumindo-as hoje.

## Eventos — `/api/v1/events`

Tabela append-only (`updatedAt: false`). Alimenta o funil do painel comercial.

`product_view`, `favorite_added`, `favorite_removed`, `consultation_created`,
`consultation_answered`, `purchase_completed`, `asset_published`, `asset_sold`,
`operation_completed`, `payment_completed`.

| Rota | Acesso |
|---|---|
| `POST /product-view` | público (auth opcional) — o front dispara na página do ativo |
| `GET /summary` | `commercial_read` |
| `GET /assets/:assetId/funnel` | `commercial_read` |

**`registrar()` engole os próprios erros de propósito.** Registrar evento nunca
pode derrubar a operação que o produziu: uma falha ao gravar métrica não pode
impedir uma venda.

## Auditoria — `/api/v1/audit`

Também append-only, com `before`/`after` em JSONB. `diferenca()` guarda apenas
os campos que mudaram — log de linha inteira vira ruído e esconde a alteração
que importa.

Registra: cadastro e mudança de status de ativo, alteração de preço/modelo,
aprovação do fornecedor (com **quem** aprovou — a regra pede o usuário
responsável, não só a data), avaliação da curadoria, confirmação de pedido,
pagamento, retirada, conclusão de operação, criação de cobrança.

`GET /:entity/:entityId` devolve o histórico — exige autenticação e capacidade
de gestão.

## Notificações — `/api/v1/notifications`

Sino do usuário do token, em qualquer painel. Cada notificação carrega `link`,
para o sino navegar até o objeto em vez de só informar.

**Comprador:** consulta respondida, compra confirmada, compra pronta para retirada.
**Fornecedor:** ativo aguardando aprovação, publicado, vendido, valor a receber,
pagamento realizado.
**Gestão:** nova consulta, novo envio, venda realizada, repasse pendente.

O fornecedor **não** é notificado de nova consulta: a consulta pertence à relação
comprador → RED, ele não tem ação a executar, e avisá-lo seria ruído sem função.

`GET /`, `GET /unread-count`, `POST /:id/read`, `POST /read-all`.
Envio de e-mail é opcional por notificação (`{ email: true }`) e falha em silêncio.
