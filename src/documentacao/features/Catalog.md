# Catalog — categorias e subcategorias

Base: `/api/v1/catalog`

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/categories` | — | Categorias ativas com subcategorias |
| GET | `/categories/:slug` | — | Uma categoria |
| POST | `/categories` | admin | Cria |
| PATCH | `/categories/:id` | admin | Atualiza |
| POST | `/subcategories` | admin | Cria |
| PATCH | `/subcategories/:id` | admin | Atualiza |

## Estrutura semeada

| Categoria | Subcategorias |
|---|---|
| **RED Construção** | Hidráulica · Elétrica · Pisos e Revestimentos · Louças, Metais e Sanitários · Ferragens e Acessórios |
| **RED Equipamentos** | Cozinha Industrial · Refrigeração e Conservação · Climatização e Ventilação · Iluminação · TI, Automação e Telefonia |
| **RED Mobiliário** | Escritório · Hotelaria · Comércio e Varejo · Residencial · Áreas Externas |

Três categorias, quinze subcategorias. É a mesma lista do menu do site.

## Notas

- `slug` é gerado do nome quando omitido, sem acento
- `slug` de subcategoria é único **dentro da categoria** — pode haver "Outros"
  em mais de uma
- `active: false` esconde do público sem apagar; ativos existentes continuam
  apontando para a categoria
- Apagar categoria com ativos é bloqueado pelo banco (`ON DELETE RESTRICT`)
