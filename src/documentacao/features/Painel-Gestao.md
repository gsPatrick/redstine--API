# Painel de gestão

Base: `/api/v1/management`. Documento oficial, seções 18 a 22.

## A distinção que estrutura tudo

| | O que é | Responde ao filtro de período? |
|---|---|---|
| **Estado** | Quanto existe agora — ativos publicados, receita potencial, valor a repassar | **Não** |
| **Fluxo** | Quanto aconteceu no intervalo — vendas, consultas, receita reconhecida | **Sim** |

Misturar os dois é o erro clássico de dashboard: o gestor filtra "últimos 7 dias"
e vê o estoque encolher, como se ativos tivessem desaparecido. "Ativos publicados
no último mês" não é uma pergunta válida — o ativo está publicado hoje ou não está.

Por isso `GET /overview?periodo=7d` e `GET /overview?periodo=90d` devolvem
**o mesmo** bloco `estado` e blocos `fluxo` diferentes. Há asserção de smoke
cobrindo exatamente isso.

## Filtro de período

`?periodo=7d|30d|90d|12m|tudo` (default `30d`), ou `?desde=&ate=` em ISO.
Datas explícitas vencem o atalho. `tudo` não tem início — é o acumulado.

## Endpoints

### `GET /overview` — capacidade `commercial_read`
```
estado    ativosPublicados, ativosEmCuradoria, ativosAguardandoAprovacao,
          ativosVendidos, fornecedoresComAtivo, compradores, receitaPotencial
fluxo     vendasRealizadas, valorVendido, ticketMedio, consultasRecebidas,
          enviosRecebidos, ativosPublicados, operacoesConcluidas
financeiro  receitaRed, aRepassar, repassado
alertas   enviosSemAvaliacao, ativosAguardandoAprovacao, consultasEmAberto,
          repassesForaDoPrazo, prazoRepasseHoras
```
`alertas` é o que exige ação humana hoje — nada ali é filtrável por período.
`repassesForaDoPrazo` conta repasses cujo `dueAt` (conclusão + 48h) já passou.

### `GET /commercial` — capacidade `commercial_read`
Vendas por categoria (ordenadas por valor), funil, consultas por status,
ranking de mais vistos e mais favoritados.

O funil sai da **tabela de eventos**, não das tabelas de negócio: é a única
fonte que enxerga o topo — quem olhou e não comprou. `conversao` vem `null`
quando não houve visita, em vez de `0%`: sem base não há taxa, há divisão por
zero disfarçada.

### `GET /financial` — capacidade `financial_read`
```
posicao         aRepassar, repassado, receitaRedAcumulada   (acumulado, sem filtro)
periodoValores  o mesmo recorte dentro do intervalo
repasses        pendentes, valorVencido, valorVencendoEm24h
porModeloComercial  RED Estoque x RED Catálogo, com margemRed
```

## Acesso

Capacidade, não papel (seção 19: *"um usuário sem permissão financeira não pode
acessar o dado por URL ou API, mesmo que o botão esteja oculto"*). Esconder menu
no front não é segurança.

- `comercial` alcança `/overview` e `/commercial`, **não** `/financial`
- `financeiro` alcança `/financial`, **não** os outros dois
- `admin` alcança tudo
- `fornecedor` e `comprador` não têm capacidade de gestão nenhuma

Coberto por testes unitários em `tests/dashboard.test.js`.
