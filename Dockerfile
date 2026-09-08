# ---------------------------------------------------------------------------
# API RED — imagem de produção
#
# Duas etapas: a primeira resolve as dependências, a segunda monta a imagem
# final. O que importa é que o `node_modules` de produção seja construído numa
# camada própria — assim uma mudança em `src/` não reinstala nada, e o deploy
# no EasyPanel passa de minutos para segundos.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps

WORKDIR /app

# Só os manifestos primeiro: esta camada só é refeita quando uma dependência
# muda, não a cada alteração de código.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev


# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner

# `tini` como PID 1: sem ele o Node não recebe SIGTERM e o contêiner leva 10s
# para morrer em cada deploy, cortando requisições em curso.
RUN apk add --no-cache tini

ENV NODE_ENV=production
ENV APP_PORT=4000

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# O diretório de uploads precisa existir e pertencer ao utilizador da
# aplicação. Monte um volume aqui no EasyPanel — sem volume, as imagens
# enviadas somem no próximo deploy.
RUN mkdir -p /app/uploads && chown -R node:node /app

# Nunca como root: um processo comprometido dentro do contêiner fica limitado
# ao que o utilizador `node` pode fazer.
USER node

EXPOSE 4000

# O healthcheck bate no mesmo endpoint que o EasyPanel pode usar: ele responde
# 503 quando o banco está fora, então um contêiner sem banco não é declarado
# saudável.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.APP_PORT||4000)+'/api/v1/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "app.js"]
