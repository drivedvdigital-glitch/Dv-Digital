# D&VFly em container — o caminho "minha VM".
#
# Duas etapas: a primeira instala tudo e compila; a segunda leva apenas o que o
# servidor precisa para rodar. O resultado é uma imagem pequena que sobe em
# segundos e não carrega o código-fonte do projeto para dentro do servidor.
#
# Node 22: o projeto usa `--experimental-strip-types` nos pacotes e o servidor
# próprio (app/server.mjs), que confia no proxy à frente (Caddy) — sem isso o
# CSRF do React Router recusa todo Salvar e Publicar.

# ---- 1. build ---------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# openssl: o motor de consulta do Prisma o exige.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# As dependências primeiro, para que uma mudança de código não refaça o
# `npm ci` inteiro. O workspace precisa dos três package.json.
COPY package.json package-lock.json ./
COPY app/package.json ./app/
COPY packages/compiler/package.json ./packages/compiler/
COPY packages/shopify/package.json ./packages/shopify/
RUN npm ci --no-audit --no-fund

COPY . .

# O schema do Prisma é gerado a partir do template conforme o DATABASE_URL.
# No build ainda não há banco: postgresql aqui só escolhe o provider, nada
# conecta (as migrations rodam no start, pelo entrypoint).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run build

# Fora tudo que só servia para compilar (vite, typescript, tipos): a imagem cai
# pela metade, e numa VPS isso é disco e tempo de download a cada publicação.
# O CLI do Prisma fica: é ele que aplica as migrations no start.
RUN npm prune --omit=dev

# ---- 2. runtime -------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# O build já resolveu tudo; aqui entra só o necessário para servir e migrar.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/app/package.json ./app/package.json
COPY --from=build /app/app/build ./app/build
COPY --from=build /app/app/server.mjs ./app/server.mjs
COPY --from=build /app/app/scripts ./app/scripts
COPY --from=build /app/app/prisma ./app/prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# Não roda como root: se algo escapar, escapa sem poder.
USER node
EXPOSE 3000

# As migrations pendentes são aplicadas a cada start e só então o servidor
# sobe: publicar uma versão nova nunca exige lembrar de migrar à mão.
CMD ["sh", "-c", "cd /app/app && node scripts/db-sync.mjs && node server.mjs"]
