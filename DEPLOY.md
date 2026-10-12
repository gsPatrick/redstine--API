# Deploy no EasyPanel

Dois serviços: **API** e **Front**, cada um no seu repositório, mais um
**Postgres**. O EasyPanel constrói a partir do `Dockerfile` de cada repositório.

## 1. Banco de dados

Crie um serviço **Postgres** no EasyPanel.

> **Não use a porta 5432 aberta para a internet.** A API roda no mesmo servidor
> e alcança o banco pela rede interna do EasyPanel — normalmente pelo nome do
> serviço, algo como `redestine_db`. Expor o Postgres publicamente com senha
> fraca é varrido por bots em minutos.

## 2. API

**Repositório:** `gsPatrick/redstine--API` · **Dockerfile:** `Dockerfile` · **Porta:** `4000`

### Variáveis de ambiente

```
NODE_ENV=production
APP_PORT=4000
APP_API_PREFIX=/api
APP_SITE_URL=https://redestine.com.br
APP_PUBLIC_URL=https://api.redestine.com.br

DB_HOST=<nome-do-serviço-postgres-na-rede-interna>
DB_PORT=5432
DB_NAME=<banco>
DB_USER=<usuário>
DB_PASSWORD=<senha forte, diferente do usuário>
DB_SSL=false

JWT_SECRET=<64 caracteres aleatórios — gere um novo, não reaproveite>
JWT_EXPIRES_IN=7d

# `*` libera qualquer origem; uma lista separada por vírgula restringe.
# O valor de APP_SITE_URL entra automaticamente nas origens permitidas.
CORS_ORIGINS=*

MAIL_HOST=<smtp>
MAIL_PORT=587
MAIL_USER=<usuário>
MAIL_PASSWORD=<senha>
MAIL_FROM=RED <nao-responda@redestine.com.br>

PAYMENT_PROVIDER=manual
PAYMENT_MODE=custodia
PAYMENT_METHODS=pix,boleto,cartao
```

Gere o segredo com:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> A aplicação **recusa subir** sem `JWT_SECRET`, e em produção exige no mínimo
> 32 caracteres. É proposital: falhar no boot com mensagem clara é melhor do
> que subir e emitir tokens assináveis por qualquer um.

### Volume

Monte um volume em **`/app/uploads`**. Sem ele, as imagens enviadas somem a
cada deploy.

### Primeiro deploy — não precisa fazer nada

A API prepara o banco sozinha no arranque:

| Passo | Quando roda | Se falhar |
|---|---|---|
| Migrações | sempre | a API **não sobe** — esquema incompleto produz erro em toda rota |
| Seed | sempre (idempotente) | a API sobe; o log diz o que houve |
| Catálogo inicial | **só quando não há nenhum ativo** | a API sobe sem catálogo |

O catálogo roda uma vez só de propósito. A importação atualiza pelo slug, então
rodá-la a cada arranque desfaria qualquer preço ou descrição que a curadoria
tivesse ajustado no painel — um reinício não pode reverter trabalho.

Antes de tudo isso a API espera o banco aceitar conexão, até 12 tentativas a
cada 3 segundos. Num deploy, a API costuma ficar pronta antes do Postgres, e
sem essa espera o contêiner morreria em ciclo.

Acompanhe pelo log do contêiner:

```
[db] conexao estabelecida
[bootstrap] migrações: 1 aplicada(s) de 17
[bootstrap]   + 20261012000000-venda-minima-e-indicador-consulta.js
[bootstrap] seed: ...
[bootstrap] catálogo inicial: ...
[api] a ouvir em ...
```

A linha das migrações é a que confirma o deploy: ela diz **quais** correram
agora, pelo nome. Quando não há nada pendente, diz `nenhuma pendente (N já
aplicadas)`. Se uma migração falhar, a API **não sobe** — o log mostra o erro e
o contêiner reinicia, porque um esquema incompleto daria 500 em todas as rotas
em vez de um erro visível.

As migrações correm dentro do próprio processo (`src/config/migrador.js`), na
mesma tabela `SequelizeMeta` do `sequelize-cli` — `npm run migrate` e
`db:migrate:status` continuam a ver o estado certo, e nada é aplicado duas
vezes. O `npx sequelize-cli` saiu do arranque porque, num contêiner sem rede de
saída, um `npx` que não encontra o binário tenta baixá-lo e fica preso, com o
log a acusar o registry em vez do problema real.

> **Migração que falha a meio** deixa o esquema parcialmente alterado e ela
> própria por aplicar — a API não sobe e a tentativa seguinte falha de novo, em
> "a coluna já existe". Não há rollback automático (o `sequelize-cli` também não
> o tem). Por isso cada migração é escrita para poder correr duas vezes
> (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`). Para sair do estado: suba com
> `BOOTSTRAP_DB=false`, corrija no banco, e volte ao normal.

O admin nasce como `admin@redestine.com.br`. **Troque a senha no primeiro
acesso** — ou defina `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` antes do
primeiro arranque.

### Desligar o preparo automático

```
BOOTSTRAP_DB=false        # não roda nada — para conduzir uma migração à mão
BOOTSTRAP_CATALOG=false   # roda migrações e seed, sem o catálogo inicial
```

## 3. Front

**Repositório:** `gsPatrick/redstine--FRONT` · **Dockerfile:** `Dockerfile` · **Porta:** `3000`

### Build argument — não é variável de ambiente

```
NEXT_PUBLIC_API_URL=https://api.redestine.com.br/api/v1
```

> Este valor precisa ir em **"Build arguments"**, não em "Environment".
>
> As telas do painel chamam a API a partir do navegador, e o Next embute as
> variáveis `NEXT_PUBLIC_*` no JavaScript durante o build. Definida só no
> ambiente do contêiner, ela não chega ao navegador e o painel tenta falar com
> `localhost:4000` na máquina do visitante.
>
> Trocar o endereço depois exige **rebuild**, não apenas restart.

## 4. Domínios

| Serviço | Domínio |
|---|---|
| Front | `redestine.com.br` e `www.redestine.com.br` |
| API | `api.redestine.com.br` |

Ative o SSL do EasyPanel nos dois. A API precisa de HTTPS: o navegador recusa
uma página `https://` que chama uma API `http://`.

### Alternativa sem subdomínio

Se preferir tudo num domínio só, aponte `redestine.com.br/api` para o serviço
da API pelo proxy do EasyPanel e use `NEXT_PUBLIC_API_URL=https://redestine.com.br/api/v1`.
Elimina o CORS por completo — mesma origem — e uma variável a menos para errar.

## 5. Conferir que subiu

```bash
curl https://api.redestine.com.br/api/v1/ping     # {"status":"ok","db":"up"}
curl https://api.redestine.com.br/api/v1/assets   # catálogo público
```

Depois, no navegador: abra `redestine.com.br`, entre em `/entrar` e confirme
que o painel carrega os dados. Se o catálogo aparece mas o painel fica em
"Carregando…", o `NEXT_PUBLIC_API_URL` não entrou no build.

## 6. Sobre o CORS aberto

`CORS_ORIGINS=*` permite que qualquer site chame esta API a partir do
navegador. Aqui o risco é menor do que o habitual: a sessão é um **Bearer
token no localStorage**, que é isolado por origem — um site de terceiros não
consegue lê-lo nem viajar de carona na sessão de quem está autenticado. O que
a abertura permite é qualquer front consumir a API diretamente.

Quando restringir vale a pena:

- Se a autenticação passar a usar **cookie**, a abertura vira um buraco de
  CSRF e a allowlist deixa de ser opcional.
- Depois que o domínio definitivo estiver de pé, trocar para
  `CORS_ORIGINS=https://redestine.com.br` custa uma variável e reduz a
  superfície sem nenhum efeito colateral.

## 7. Antes de abrir ao público

- [ ] Senha do Postgres trocada e porta externa fechada
- [ ] `JWT_SECRET` novo, com 64 caracteres
- [ ] Senha do admin alterada no primeiro acesso
- [ ] Senhas da VPS e da Hostinger rotacionadas — circularam em texto puro no WhatsApp
- [ ] Volume de uploads montado
- [ ] SMTP configurado (sem ele, os e-mails só aparecem no log do contêiner)
