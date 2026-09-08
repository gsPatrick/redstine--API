# Submissions — envio de ativos

Base: `/api/v1/submissions`

É a porta de entrada da página **Vender**. Um envio nunca vira ativo por si só —
regra nº 3.

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/` | opcional | Envio público |
| GET | `/` | interno | Lista |
| GET | `/:id` | interno | Detalhe com avaliações |
| POST | `/:id/start-review` | interno | `recebida` → `em_avaliacao` |
| GET | `/:id/evaluations` | interno | Histórico de curadoria |
| POST | `/:id/evaluations` | interno | **Decide** (ver Evaluations.md) |

## Enviar

```json
POST /api/v1/submissions
{
  "name": "Construtora Alfa", "email": "contato@alfa.com.br", "phone": "21999999999",
  "city": "Rio de Janeiro/RJ",
  "description": "Lote de tubos de PVC novos, sobra de obra, cerca de 40 unidades.",
  "approximateQuantity": "40 unidades",
  "photos": ["https://.../foto1.jpg"],
  "authorized": true
}
```

```json
{ "data": { "reference": "RED-K2M8QT", "status": "recebida" } }
```

A resposta pública devolve só a referência — é o que o fornecedor precisa para
acompanhar.

## `authorized` é obrigatório e literal

O schema exige `true`, não apenas a presença do campo. Mandar `false` devolve
`422 AUTHORIZATION_REQUIRED`. Corresponde ao checkbox do formulário:

> "Declaro que as informações enviadas são verdadeiras e que possuo autorização
> para disponibilizar os ativos para avaliação."

É a base jurídica do envio; sem ela a RED não pode avaliar.

## Sem conta

O envio aceita anônimo — vira lead. Com token, fica vinculado ao `supplierId`.

## Estados

`recebida` → `em_avaliacao` → `aprovada` \| `recusada`

As duas últimas são terminais: nova avaliação devolve
`422 SUBMISSION_ALREADY_DECIDED`.

## Erros

| Código | HTTP | Quando |
|---|---|---|
| `AUTHORIZATION_REQUIRED` | 422 | `authorized` não é `true` |
| `SUBMISSION_NOT_FOUND` | 404 | Não existe |
| `INVALID_SUBMISSION_STATUS` | 422 | `start-review` fora de `recebida` |
| `VALIDATION_ERROR` | 422 | Campos inválidos (`details` diz quais) |
