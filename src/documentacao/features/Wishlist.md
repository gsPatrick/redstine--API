# Wishlist — favoritos

Base: `/api/v1/wishlist` · **Todas as rotas exigem autenticação**

Existe para a lista sobreviver à troca de navegador — antes vivia só no
`localStorage` do site.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Lista os favoritos do utilizador |
| POST | `/` | Adiciona (`{ assetId }`) |
| POST | `/:assetId/toggle` | **Alterna** — é o que o botão de coração usa |
| POST | `/sync` | Importa uma lista (`{ assetIds: [...] }`) |
| DELETE | `/:assetId` | Remove |

Não existe parâmetro de utilizador em nenhuma rota: o dono é sempre o do token.

## Toggle

```json
POST /api/v1/wishlist/{assetId}/toggle
→ { "data": { "assetId": "...", "favorito": true } }
```

Uma chamada em vez de "consultar, decidir, adicionar ou remover".

## Sync

Quando o visitante favorita sem conta e depois entra, os favoritos do
`localStorage` seriam perdidos. `POST /sync` importa a lista:

```json
{ "assetIds": ["uuid-1", "uuid-2"] }
→ { "data": { "importados": 2, "ignorados": 0 } }
```

Ids inexistentes são ignorados, não causam erro. Duplicados são absorvidos pelo
índice único `(user_id, asset_id)`.

## Ativo que saiu do ar

O favorito **não some** quando o ativo é vendido ou inativo. Cada item traz
`disponivel: boolean` — a lista mostra o estado real em vez de esconder o item.

## Erros

| Código | HTTP | Quando |
|---|---|---|
| `ASSET_NOT_FOUND` | 404 | Ativo não existe |
| `WISHLIST_ITEM_NOT_FOUND` | 404 | Remover algo que não está na lista |
