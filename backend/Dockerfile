# Build multi-stage : l'image finale ne contient ni sources TS, ni devDependencies.
# Contexte de build attendu : le dossier /backend (voir captain-definition).

# --- Étape 1 : compilation TypeScript ---------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

# La version de pnpm vient du champ `packageManager` de package.json.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# --- Étape 2 : dépendances de production uniquement -------------------------
FROM node:22-alpine AS deps
WORKDIR /app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod && pnpm store prune

# --- Étape 3 : image d'exécution --------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

# tini comme PID 1 : sans lui, Node ignore SIGTERM et CapRover tue le container
# de force à chaque redéploiement (requêtes en cours perdues).
RUN apk add --no-cache tini

ENV NODE_ENV=production
ENV PORT=3000

# node_modules est copié en entier (dont .pnpm) : les liens symboliques du
# linker isolé sont relatifs à /app, ils restent valides d'une étape à l'autre.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# L'image node fournit déjà un utilisateur non-root.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main"]
