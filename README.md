# Grindrise

Application mobile de tracking sportif avec une couche de gamification RPG
(classes, niveaux, XP, lore narratif).

## Structure du monorepo

```
mobile/     App Expo (React Native + TypeScript), organisée par feature
backend/    API NestJS (modular monolith), déployée en container sur CapRover
  worker/   emplacement du futur worker de notifications (BullMQ) — vide
```

Il n'y a volontairement **pas d'outil de monorepo** (npm workspaces, Turborepo…) :
les deux projets ont des toolchains disjointes (Metro vs Nest CLI) et ne
partagent aucun code pour l'instant. À ajouter le jour où un package de types
partagés devient nécessaire.

## Répartition des responsabilités

- **Mobile → Supabase directement** (clé `anon`, RLS) : lectures et CRUD simples.
- **Mobile → API NestJS** (clé `service_role` côté serveur) : toute logique
  métier non triviale — calcul d'XP, règles de niveaux, contenu narratif
  conditionnel, entitlements.

Règle centrale : **le client n'écrit jamais d'XP**. Il enregistre une séance,
le serveur en déduit l'XP et écrit `xp_events`.

## Lancer en local

### Mobile

```bash
cd mobile
npm install
cp .env.example .env    # renseigner l'URL du projet Supabase + la clé anon
npx expo start          # -c pour vider le cache Metro après un changement de .env
```

Scanner le QR code avec Expo Go (Android/iOS). Le squelette démarre même sans
`.env` : les appels Supabase sont simplement désactivés, et l'écran de connexion
propose une session de développement pour parcourir la navigation.

Builds iOS/Android : via **EAS Build** (build cloud, pas de Mac requis) — à
configurer le moment venu avec `npx eas build:configure`.

### Backend

```bash
cd backend
npm install
cp .env.example .env    # renseigner SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm run start:dev
```

L'API **refuse de démarrer** si une variable requise manque — c'est voulu.
Vérification : `curl http://localhost:3000/health` → `{"status":"ok"}`.

## Secrets

Aucun `.env` n'est commité. Les `.env.example` documentent les variables
attendues. La clé `service_role` de Supabase ne doit **jamais** apparaître côté
mobile : seule la clé `anon` y a sa place (elle est protégée par la RLS).

## État actuel

Squelette uniquement : navigation parcourable avec écrans placeholder côté
mobile, modules NestJS structurés mais sans implémentation. Les tables Supabase
ne sont pas encore créées.
