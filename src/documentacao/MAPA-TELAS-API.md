# Mapa: tela do front → endpoint da API

> Os dois painéis são a especificação. Cada tela abaixo tem endpoint que
> devolve a resposta **pronta para renderizar** — o front não junta pedido com
> item com ativo com repasse para descobrir o que mostrar numa célula.

Base: `/api/v1`. Tudo autenticado por `Authorization: Bearer <token>`.

---

## Área do Cliente — `/painel`

| Tela | Rota do front | Endpoint |
|---|---|---|
| Visão Geral | `/painel` | `GET /me/overview` |
| Sino (todas as telas) | — | `GET /notifications` · `GET /notifications/unread-count` · `POST /notifications/:id/read` · `POST /notifications/read-all` |
| Minhas Compras | `/painel/compras` | `GET /me/purchases?status=&page=` |
| Detalhe da Compra | `/painel/compras/[id]` | `GET /me/purchases/:id` |
| Minhas Consultas | `/painel/consultas` | `GET /me/consultations?status=` |
| Detalhe da Consulta | `/painel/consultas/[id]` | `GET /me/consultations/:id` |
| Favoritos | `/painel/favoritos` | `GET /wishlist` · `POST /wishlist/:assetId/toggle` · `DELETE /wishlist/:assetId` |
| Dashboard de Vendas | `/painel/vender` | `GET /me/sales-dashboard?periodo=30d` |
| Meus Ativos | `/painel/vender/ativos` | `GET /me/my-assets?status=&search=` |
| Vendas | `/painel/vender/vendas` | `GET /me/sales?periodo=&status=` |
| Financeiro — movimentações | `/painel/vender/financeiro` | `GET /me/sales` |
| Financeiro — histórico | aba da mesma tela | `GET /me/payments` |
| Enviar Ativos | `/painel/vender/enviar` | `GET /catalog/categories` (traz subcategorias) · `POST /uploads/images` · `POST /me/asset-submissions` |
| Dados Cadastrais | `/painel/conta` | `GET /me/profile` · `PATCH /me/profile` |
| Empresa | `/painel/conta/empresa` | `PATCH /me/company` |
| Endereços | `/painel/conta/enderecos` | `PUT /me/addresses` |
| Segurança | `/painel/conta/seguranca` | `POST /me/password` |

### Formatos que importam

**`GET /me/overview`** — a página inteira numa chamada.
```json
{ "comprar": { "compras": 4, "consultas": 2, "favoritos": 8 },
  "vender": { "ativosPublicados": 12, "ativosVendidos": 5,
              "receitaPotencial": 48600, "aReceber": 7800,
              "recebido": 13600, "vendasRealizadas": 21400 },
  "atividades": [{ "titulo": "...", "data": "...", "href": "/painel/compras/..." }] }
```

**`GET /me/sales-dashboard`** — `estado` e `fluxo` vêm separados de propósito.
```json
{ "periodo": { "desde": "...", "ate": "..." },
  "estado": { "ativosPublicados": 12, "receitaPotencial": 48600, "aReceber": 7800 },
  "fluxo":  { "ativosVendidos": 5, "vendasRealizadas": 21400, "recebido": 13600 },
  "graficos": { "resultados": [...], "ativosPorStatus": [...] } }
```
> O que está em `estado` **não responde ao filtro de período** — e a API garante
> isso, não o front. Trocar `?periodo=30d` por `?periodo=90d` devolve o mesmo
> `estado`. Há asserção de smoke cobrindo exatamente essa igualdade.

**`GET /me/purchases`** — a linha já vem montada, com o status operacional
derivado dos três eixos que o banco guarda separados (pedido, pagamento,
retirada):
```json
{ "pedido": "#RED-9XM2", "data": "...", "produto": "Lote de Tubos PVC Tigre",
  "imagem": "...", "quantidade": 100, "valor": 12000, "status": "Aguardando retirada" }
```

---

## Painel de Gestão — `/gestao`

| Tela | Rota do front | Endpoint |
|---|---|---|
| Visão Geral | `/gestao` | `GET /management/overview?periodo=30d` |
| Comercial · Consultas | `/gestao/comercial/consultas` | `GET /management/consultations` + `GET /management/consultations/summary` |
| — atender consulta | ação da tela | `POST /quotes/:id/assign` · `POST /quotes/:id/respond` · `PATCH /quotes/:id/status` |
| Comercial · Ativos | `/gestao/comercial/ativos` | `GET /management/assets?status=&category=&commercialModel=&search=` |
| — mudar status do ativo | ação da tela | `PATCH /assets/:id/status` · `POST /assets/:id/supplier-approval` |
| Comercial · Vendas | `/gestao/comercial/vendas` | `GET /management/sales` + `GET /management/sales/summary` |
| Financeiro · Movimentações | `/gestao/financeiro/movimentacoes` | `GET /management/financial/movements` |
| Detalhe da Venda | `/gestao/financeiro/movimentacoes/[id]` | `GET /management/financial/movements/:id` |
| Financeiro · Repasses | `/gestao/financeiro/repasses` | `GET /management/financial/payouts?aba=devidos\|programados\|pagos` |
| — ações em lote | botões da tela | `POST /payouts/schedule` · `POST /payouts/mark-paid` |
| Financeiro · Relatórios | `/gestao/financeiro/relatorios` | `GET /management/reports/by-model` · `by-category` · `by-supplier` · `sales-evolution` |
| — exportar | botão da tela | `GET /management/reports/:recorte/export?formato=csv` |
| Configurações | `/gestao/configuracoes` | `GET /management/settings` · `PATCH /management/settings` |
| Usuários | `/gestao/configuracoes/usuarios` | `GET /users` · `POST /users` · `PATCH /users/:id` |
| Permissões | `/gestao/configuracoes/permissoes` | `GET /management/permissions` |

### Formatos que importam

**`GET /management/overview`** — cartões, variações, pendências e gráficos.
```json
{ "estado":  { "fornecedoresAtivos": 38, "ativosPublicados": 356,
               "receitaPotencial": 1482000 },
  "fluxo":   { "vendasRealizadas": 12, "valorVendido": 312400, "ticketMedio": ... },
  "financeiro": { "receitaRed": 93720, "aRepassar": 124860, "repassado": ... },
  "variacoes":  { "valorVendido": 22, "consultasRecebidas": 34 },
  "graficos":   { "evolucaoVendas": [...], "vendasPorCategoria": [...] },
  "alertas":    { "consultasEmAberto": 8, "ativosAguardandoAprovacao": 15,
                  "repassesForaDoPrazo": 0, "prazoRepasseHoras": 48 } }
```
> `variacoes` compara com o **período imediatamente anterior de mesma duração**.
> Sem base anterior o campo vem `null`, nunca `0%` nem `+100%`: crescer de zero
> não tem percentual, e exibir um ali seria inventar uma medida.

**`GET /management/financial/movements`** — os totais vêm no `meta`, somados do
recorte inteiro (não só da página visível):
```json
{ "data": [...],
  "meta": { "page": 1, "total": 68,
            "totais": { "valorBruto": 312400, "custosAprovados": 0,
                        "valorLiquido": 312400, "valorFornecedores": 218680,
                        "receitaRed": 93720 } } }
```
Invariante conferível na tela: `valorBruto = receitaRed + valorFornecedores + custosAprovados`.

**`GET /management/financial/payouts`** — cada linha traz o aging pronto:
```json
{ "valor": 7800, "prazo": "2026-05-25T...", "horasRestantes": 34.5,
  "situacao": "no_prazo" }
```
`situacao` ∈ `vencido` · `vencendo` · `no_prazo` · `sem_prazo`. O limiar de
"vencendo" vem de `repasse.alertaHoras` nas configurações.

---

## Acesso

Controle por **capacidade**, no backend:

| Perfil | Alcança |
|---|---|
| `admin` (Master) | tudo |
| `comercial` | `/management/overview`, `/consultations`, `/assets`, `/sales`, `/reports/sales-evolution`, `/reports/by-category` |
| `curador` | mesmas capacidades comerciais (avaliação de ativos) |
| `financeiro` | `/management/financial/*`, `/reports/by-model`, `/reports/by-supplier`, exportação |
| `fornecedor` · `comprador` | apenas `/me/*` |

Um usuário sem permissão financeira recebe **403** ao chamar `/management/financial/*`
mesmo digitando a URL com token válido. Esconder o menu não é controle de segurança.

## Convenções

- Sucesso: `{ "data": ... }`; listagem: `{ "data": [...], "meta": { page, perPage, total, totalPages } }`.
- Erro: `{ "error": { "code": "...", "message": "...", "details": [...] } }` — ramifique pelo `code`, que é estável.
- Filtro temporal: `?periodo=7d|30d|90d|12m|tudo` ou `?desde=&ate=` em ISO. Datas explícitas vencem o atalho.
- Valores monetários vêm como número com 2 casas; a formatação em `R$` é do front.
- Percentuais em vendas e repasses são **snapshot da transação**, nunca o padrão atual da modalidade.


---

## Como conferir que a API serve os painéis

```bash
npm run check:paineis
```

Roda duas verificações contra a API de pé, com um cenário de demonstração real
(`npm run seed:demo` — fornecedor com ativos nos dois modelos, uma venda paga,
uma a receber, consultas nos quatro status):

**`check:contrato`** — para cada tela, confere que a resposta traz **todos os
campos que aquela tela lê**. Verifica presença de campo, não status 200: uma
rota que responde 200 com um objeto sem `participacao` quebra a coluna da
tabela do mesmo jeito. Exige dado real — conferir contra lista vazia é passar
por omissão.

**`check:acoes`** — o contrato prova que a tela *renderiza*; isto prova que ela
*funciona*: atender consulta, programar e pagar repasse em lote, gravar
configuração. E que a separação de acesso vale: fornecedor recebe **403** em
`/management/*` mesmo com token válido.

Uma asserção que vale destacar, porque é a regra mais cara de quebrar:

> Alterar `split.catalogo.fornecedor` de 65 para 60 muda o potencial dos ativos
> ainda não vendidos, e **não move nenhuma venda já realizada** — o percentual
> foi congelado no repasse no momento da transação.

## Status do ativo — vocabulário oficial

`rascunho` → `em_avaliacao` → `aguardando_aprovacao` → `aprovado` → `publicado` → `vendido`, com `inativo` alcançável de qualquer ponto.

As telas exibem os cinco do documento: **Em avaliação, Aguardando aprovação,
Publicado, Vendido, Inativo**. `rascunho` e `aprovado` são etapas internas entre
o envio e a publicação.
