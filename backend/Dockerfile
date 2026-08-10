# Build multi-stage : l'image finale ne contient ni sources TS, ni devDependencies.
# Contexte de build attendu : le dossier /backend (voir captain-definition).

# --- Étape 1 : compilation TypeScript ---------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Étape 2 : dépendances de production uniquement -------------------------
FROM node:22-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- Étape 3 : image d'exécution --------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

# tini comme PID 1 : sans lui, Node ignore SIGTERM et CapRover tue le container
# de force à chaque redéploiement (requêtes en cours perdues).
RUN apk add --no-cache tini

ENV NODE_ENV=production
ENV PORT=3000

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
