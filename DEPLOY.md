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

CORS_ORIGINS=https://redestine.com.br,https://www.redestine.com.br
# O valor de APP_SITE_URL entra automaticamente nas origens permitidas —
# definir os dois com o mesmo domínio é redundante, mas não faz mal.

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
[bootstrap] migrações: ...
[bootstrap] seed: ...
[bootstrap] catálogo inicial: ...
[api] a ouvir em ...
```

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

## 6. Antes de abrir ao público

- [ ] Senha do Postgres trocada e porta externa fechada
- [ ] `JWT_SECRET` novo, com 64 caracteres
- [ ] Senha do admin alterada no primeiro acesso
- [ ] Senhas da VPS e da Hostinger rotacionadas — circularam em texto puro no WhatsApp
- [ ] Volume de uploads montado
- [ ] SMTP configurado (sem ele, os e-mails só aparecem no log do contêiner)
