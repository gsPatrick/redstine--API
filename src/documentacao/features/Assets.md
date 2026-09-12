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
`commercialModel` (`estoque`\|`catalogo`\|`proprio`) · `location` · `brand` · `featured` ·
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
  "meta": {
    "page": 1, "perPage": 20, "total": 9, "totalPages": 1,
    "filtros": {
      "brand": [{ "value": "Portinari", "label": "Portinari", "count": 2 }],
      "location": [], "condition": [], "saleFormat": [], "availability": [], "category": []
    }
  }
}
```

`discountPercent` vem calculado pela API. É `null` quando não há `marketPrice`.

### `meta.filtros` — o painel de filtros

Só o catálogo público devolve `filtros` (a área interna precisa de alcançar
também o que está esgotado). São as opções que **ainda têm acervo**: só entra
valor de ativo com `quantity > 0`. Quando o estoque de um ativo zera, a marca
dele sai do filtro no mesmo instante.

O ativo esgotado **continua na listagem**, sinalizado: `inStock: false` e a
linha `"Estoque": "Esgotado"` em `attributes`. Sumir com ele daria 404 numa URL
indexada a cada esgotamento; o que engana o comprador é um filtro que devolve
zero resultado.

As contagens saem da mesma consulta filtrada da listagem, sem paginação — o
número ao lado da opção é o que o clique devolve.

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
