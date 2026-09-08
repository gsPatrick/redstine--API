# Financeiro — a regra que não admite interpretação

> O documento oficial de regras diz, sobre esta parte:
> *"Essa é a parte que eu pediria ao programador para ler duas vezes. O resto
> pode ter margem de interface e implementação; essa lógica financeira não pode
> ter interpretação criativa."*

## A regra-mestre

```
valor_líquido    = valor_bruto − custos_aprovados
valor_fornecedor = valor_líquido × percentual_fornecedor
receita_red      = valor_líquido − valor_fornecedor
```

**O split incide sobre o líquido, nunca sobre o bruto.**

O exemplo do próprio documento:

| | |
|---|---|
| Venda bruta | R$ 10.000 |
| Transporte aprovado | R$ 1.000 |
| **Valor líquido** | **R$ 9.000** |
| Fornecedor (RED Catálogo, 65%) | R$ 5.850 |
| Receita RED (35%) | R$ 3.150 |

Dividir sobre o bruto daria R$ 6.500 ao fornecedor — **R$ 650 a mais** numa
única venda. Há teste unitário que trava exatamente esse erro.

## Percentuais

| Modelo | Fornecedor | RED |
|---|---|---|
| RED Estoque | 50% | 50% |
| RED Catálogo | 65% | 35% |

Vêm de `SPLIT_ESTOQUE_SUPPLIER` / `SPLIT_CATALOGO_SUPPLIER`, mas o percentual
aplicado fica **gravado no repasse**. Se o Catálogo mudar de 65% para 60%
amanhã, venda antiga não muda de valor.

## Custos dedutíveis

Individuais, nunca um total agregado — a regra justifica: *"para preservar
auditoria e transparência"*. Cada custo tem `tipo, descrição, valor,
aprovado_por, data` e vínculo com a venda.

`POST /orders/:orderId/costs` · exige `financial_write`

Custo **com** `orderItemId` pertence àquele item. **Sem** vínculo, é do pedido
inteiro e rateia entre os itens pela participação de cada um no bruto — a sobra
de centavos vai no último item, para a soma fechar.

Registrar ou remover custo **recalcula** os repasses. Mas só enquanto o valor
ainda não virou devido.

## Conclusão integral — as cinco condições

O fornecedor só passa a ter valor devido após a operação estar **integralmente
concluída**:

1. Venda confirmada
2. Pagamento do comprador confirmado
3. Retirada/entrega concluída (ou não aplicável)
4. Nenhuma pendência operacional
5. Nenhum estorno em aberto

```
GET  /orders/:id/completion   → o que ainda falta
POST /orders/:id/complete     → fecha e libera o repasse
```

`complete` recusa com `422 OPERATION_NOT_COMPLETE` e lista os pendentes. É a
**única porta** para `a_receber` — nenhum outro caminho promove um repasse.

## Status financeiro

Independente do status do ativo e do de retirada, de propósito.

```
venda_realizada → a_receber → pagamento_programado → pago
                     ↑
              conclusão integral (+48h de prazo)
```

`venda_realizada` é venda registrada ainda sujeita à conclusão. Só depois vira
saldo devido. `POST /payouts/mark-paid` recusa repasse em `venda_realizada`.

## Prazo de 48h

A partir da conclusão integral, `dueAt = agora + 48h`. O filtro `?prazo=` na
listagem separa `no_prazo`, `vencendo` (24h) e `vencido`.

## Congelamento

Concluída a operação, o repasse congela: custo novo é recusado com
`422 OPERATION_COMPLETED` e recálculo com `422 PAYOUT_FROZEN`. Corresponde ao
snapshot da venda — *"alterações futuras não podem recalcular vendas já
realizadas"*.

## Métricas

**Fornecedor** (`GET /me/summary`), na sequência oficial
`POTENCIAL → REALIZADO → A RECEBER → RECEBIDO`. Cada repasse aparece em
**exatamente um** balde: a regra proíbe somar o mesmo valor em categorias
mutuamente excludentes.

`receitaPotencial` é fotografia do agora — participação do fornecedor caso os
ativos publicados sejam vendidos pelo preço vigente. Não responde a filtro
temporal.

**Plataforma** (`GET /payouts/summary`): valor bruto vendido, custos aprovados,
valor líquido, receita RED, valor dos fornecedores, a repassar, repassado.

## Permissões

Controle por **capacidade**, não por papel — e no backend:

> *"Um usuário sem permissão financeira não pode acessar o dado por URL ou API,
> mesmo que o botão esteja oculto."*

| Papel | Capacidades |
|---|---|
| `admin` (Master) | todas |
| `comercial` | `commercial_read/write` |
| `financeiro` | `financial_read/write` |
| `curador` | `commercial_read/write` |

**Comercial não vê receita RED nem repasses.** `GET /payouts` devolve
`403 MISSING_CAPABILITY` para ele.

## Erros

| Código | HTTP | Quando |
|---|---|---|
| `OPERATION_NOT_COMPLETE` | 422 | Concluir sem as cinco condições |
| `OPERATION_ALREADY_COMPLETED` | 422 | Concluir duas vezes |
| `OPERATION_COMPLETED` | 422 | Custo após a conclusão |
| `PAYOUT_FROZEN` | 422 | Recalcular repasse congelado |
| `NO_RECEIVABLE_PAYOUTS` | 422 | Programar algo que não está em `a_receber` |
| `NO_PAYABLE_PAYOUTS` | 422 | Pagar algo que não é devido |
| `MISSING_CAPABILITY` | 403 | Papel sem a capacidade exigida |
| `ORDER_ITEM_MISMATCH` | 400 | Custo apontando item de outro pedido |
