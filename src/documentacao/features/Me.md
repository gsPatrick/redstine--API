# Me — área do utilizador

Base: `/api/v1/me` · **Todas exigem autenticação**

| Método | Rota | Descrição |
|---|---|---|
| GET | `/summary` | Painel numa chamada |
| GET | `/orders` | Meus pedidos |
| GET | `/assets` | Meus ativos (fornecedor) |
| GET | `/submissions` | Meus envios |
| GET | `/quotes` | Minhas cotações |
| GET | `/payouts` | Meus repasses |

## Por que existe

As rotas internas (`/orders`, `/assets/admin`, `/payouts`) exigem `admin` ou
`curador`. Sem esta feature, um comprador não veria os próprios pedidos e um
fornecedor não veria os próprios ativos.

Escopar aqui é mais seguro do que afrouxar aquelas rotas: **nenhuma rota de
`/me` aceita id de utilizador** — o dono vem sempre do token.

## Summary

```json
GET /api/v1/me/summary
{
  "compras": { "total": 3, "aguardandoConfirmacao": 1 },
  "vendas":  { "publicados": 12, "vendidos": 4 },
  "envios":  { "pendentes": 2 },
  "favoritos": 7,
  "carteira": { "aReceber": 1840.50, "jaPago": 620.00, "cancelado": 0,
                "quantidade": { "pendentes": 5, "pagos": 2 } }
}
```

Alimenta as abas **Compras**, **Vendas**, **Favoritos** e os números "Valor já
pago" / "Valor a receber" do painel do site. As seis consultas correm em
paralelo — uma chamada, não seis.

Todas as listas aceitam `page`, `perPage` e `status`.
