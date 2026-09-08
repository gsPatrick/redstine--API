# Models

Um ficheiro por entidade em `src/models/`. O `index.js` carrega todos e só
depois aplica as associações — assim nenhum model precisa importar outro.

Convenções: `id` UUID gerado no banco · `underscored: true` (camelCase no JS,
snake_case no SQL) · timestamps sempre.

## Entidades

| Model | Tabela | Soft delete | Papel |
|---|---|---|---|
| `User` | `users` | sim | Comprador, fornecedor, curador, admin |
| `Category` | `categories` | não | As 3 categorias |
| `Subcategory` | `subcategories` | não | As 15 frentes |
| `Asset` | `assets` | sim | **O ativo** |
| `AssetImage` | `asset_images` | não | Imagens ordenadas |
| `Submission` | `submissions` | não | Envio da página Vender |
| `Evaluation` | `evaluations` | não | Registro da curadoria |
| `Order` | `orders` | não | Pedido de compra direta |
| `OrderItem` | `order_items` | não | Linha com snapshot |
| `Quote` | `quotes` | não | Cotação sob consulta |

## Campos que carregam regra

### `Asset.price` + `Asset.marketPrice`

O par sustenta a promessa pública de "até 50% do preço de mercado".
`asset.descontoPercentual()` devolve o percentual; a API expõe como
`discountPercent`. Sem `marketPrice` não há desconto — vem `null`.

### `Asset.supplierApprovedAt`

Carimbo de que o fornecedor aprovou preço e modelo. Publicar sem ele é recusado.
Alterar preço ou modelo depois **limpa este campo** e devolve o ativo para
`aguardando_aprovacao`.

### `Asset.status`

Máquina de estados. Nunca escreva direto — use `assets.service.mudarStatus`, que
valida contra `ASSET_TRANSICOES`.

### `Submission.authorized`

Declaração de autorização sobre os ativos. O schema exige literal `true`.

### `OrderItem.nameSnapshot` / `unitPrice` / `marketPriceSnapshot`

Congelam no momento do pedido. Mudança no catálogo não reescreve histórico.

### `User.passwordHash`

Fora do `defaultScope` — nunca sai numa consulta normal. Para autenticar use
`User.scope("comSenha")`.

## Escopos

| Model | Escopo | Efeito |
|---|---|---|
| `User` | *default* | Exclui `passwordHash` |
| `User` | `comSenha` | Inclui — só para login |
| `Asset` | `publicos` | Só `status = publicado` |

## Alterar o esquema

Model e migration andam juntos. Alterar só o model não muda o banco: gere a
migration, aplique e anote aqui se o campo carregar regra.

```bash
npx sequelize-cli migration:generate --name descricao-curta
npm run migrate
```
