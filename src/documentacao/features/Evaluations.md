# Evaluations — curadoria

Rotas sob o envio: `/api/v1/submissions/:id/evaluations`

Esta feature é o que sustenta a frase pública *"cada ativo é avaliado antes de
integrar o catálogo"*. **Não existe outro caminho na API que crie um ativo a
partir de um envio.**

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/submissions/:id/evaluations` | interno | Histórico |
| POST | `/submissions/:id/evaluations` | interno | Registra a decisão |

## Aprovar

```json
POST /api/v1/submissions/{id}/evaluations
{
  "approved": true,
  "categoryId": "uuid-da-categoria",
  "subcategoryId": "uuid-opcional",
  "name": "Tubo de Esgoto PVC DN 100 — lote",
  "condition": "sem_uso",
  "quantity": 40,
  "recommendedPrice": 18.50,
  "recommendedMarketPrice": 42.00,
  "recommendedModel": "catalogo",
  "saleMode": "direta",
  "conditionNotes": "Material lacrado, sem avaria.",
  "logisticsNotes": "Retirada em Pilares, precisa de veículo médio."
}
```

Numa transação:

1. cria a `Evaluation` com as notas dos critérios e a decisão
2. cria o `Asset` em **`aguardando_aprovacao`** — nunca publicado
3. copia as fotos do envio como imagens iniciais
4. move a `Submission` para `aprovada`

O ativo ainda **não está no catálogo**. Falta a aprovação do fornecedor sobre
preço e modelo (`POST /assets/:id/supplier-approval`) e só então a publicação.

## Recusar

```json
{ "approved": false, "decisionReason": "Material sem identificação de procedência." }
```

`decisionReason` é obrigatório ao recusar — a decisão precisa ficar registrada.
Nenhum ativo é criado; a `Submission` vai para `recusada`.

## Campos condicionais

| Regra | Verificação |
|---|---|
| `approved: true` exige `categoryId` | schema (`refine`) |
| `approved: false` exige `decisionReason` | schema (`refine`) |

## Critérios registrados

`conditionNotes` · `quantityNotes` · `provenanceNotes` · `logisticsNotes` ·
`commercialNotes` — espelham o que a RED declara analisar: condição,
quantidade, procedência, logística e potencial comercial.

## Erros

| Código | HTTP | Quando |
|---|---|---|
| `SUBMISSION_NOT_FOUND` | 404 | Envio não existe |
| `SUBMISSION_ALREADY_DECIDED` | 422 | Já aprovado ou recusado |
| `CATEGORY_INVALID` | 400 | `categoryId` inexistente |
| `VALIDATION_ERROR` | 422 | Falta `categoryId` ao aprovar, ou `decisionReason` ao recusar |
