# Assets — ativos

Base: `/api/v1/assets`

O ativo é a entidade central. Leia
[Regras-de-Negocio.md](./Regras-de-Negocio.md) antes de mexer no ciclo de vida.

## Público

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Catálogo paginado. **Só ativos publicados** |
| GET | `/featured` | Destaques intercalando as 3 categorias |
| GET | `/slug/:slug` | Detalhe pelo slug |

### Filtros de `GET /assets`

`page` · `perPage` (máx 100) · `search` · `category` · `subcategory` ·
`condition` (`sem_uso`\|`seminovo`\|`usado`) · `saleMode` (`direta`\|`consulta`) ·
`commercialModel` (`estoque`\|`catalogo`) · `location` · `brand` · `featured` ·
`minPrice` · `maxPrice` · `sort` (`recentes`\|`preco_asc`\|`preco_desc`\|`nome`)

```
GET /api/v1/assets?category=red-mobiliario&condition=seminovo&sort=preco_asc
```

```json
{
  "data": [{
    "id": "...", "slug": "sofa-para-hoteis", "name": "Sofá para Hotéis",
    "price": "890.00", "marketPrice": "1980.00", "discountPercent": 55,
    "condition": "seminovo", "location": "Rio de Janeiro/RJ",
    "categoria": { "slug": "red-mobiliario", "name": "RED Mobiliário" },
    "imagens": [{ "url": "...", "position": 0 }]
  }],
  "meta": { "page": 1, "perPage": 20, "total": 9, "totalPages": 1 }
}
```

`discountPercent` vem calculado pela API. É `null` quando não há `marketPrice`.

## Interno — `admin` ou `curador`

| Método | Rota | Descrição |
|---|---|---|
| GET | `/admin` | Lista em **qualquer** status |
| GET | `/admin/:id` | Detalhe por id |
| POST | `/` | Cria (sempre em `rascunho`) |
| PATCH | `/:id` | Atualiza |
| PATCH | `/:id/status` | Muda status pela máquina de estados |
| DELETE | `/:id` | Remoção lógica |

## Aprovação do fornecedor

```
POST /api/v1/assets/:id/supplier-approval
```

Exige autenticação, mas **não** papel interno: quem aprova é o dono do ativo
(admin e curador podem por procuração). Só funciona em
`aguardando_aprovacao`. Carimba `supplierApprovedAt` e passa para `aprovado`.

Sem esse carimbo a publicação é recusada — é a regra nº 2.

## Erros

| Código | HTTP | Quando |
|---|---|---|
| `ASSET_NOT_FOUND` | 404 | Não existe, ou não está publicado na rota pública |
| `CATEGORY_INVALID` | 400 | `categoryId` inexistente |
| `SUBCATEGORY_MISMATCH` | 400 | Subcategoria de outra categoria |
| `INVALID_TRANSITION` | 422 | Salto de status não permitido |
| `SUPPLIER_APPROVAL_REQUIRED` | 422 | Publicar sem aprovação |
| `PRICE_REQUIRED` | 422 | Publicar compra direta sem preço |
| `NOT_AWAITING_APPROVAL` | 422 | Aprovar fora do estado certo |
