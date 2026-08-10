# Grindrise

Application mobile de tracking sportif avec une couche de gamification RPG
(classes, niveaux, XP, lore narratif).

## Structure du monorepo

```
mobile/     App Expo (React Native + TypeScript), organisée par feature
backend/    API NestJS (modular monolith), déployée en container sur CapRover
  worker/   emplacement du futur worker de notifications (BullMQ) — vide
supabase/   migrations SQL (à créer via la CLI)
```

Le gestionnaire de paquets est **pnpm** (épinglé par le champ `packageManager`
de chaque `package.json`).

Il n'y a volontairement **pas de workspace pnpm** : les deux projets ont des
toolchains disjointes (Metro vs Nest CLI) et ne partagent aucun code pour
l'instant, donc chacun s'installe indépendamment. Le `package.json` racine ne
porte que la CLI Supabase, dont les migrations vivent à la racine. À
transformer en vrai workspace le jour où un package de types partagés devient
nécessaire.

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
pnpm install
cp .env.example .env    # renseigner l'URL du projet Supabase + la clé anon
pnpm exec expo start    # -c pour vider le cache Metro après un changement de .env
```

`EXPO_PUBLIC_SUPABASE_URL` est l'**URL du projet** (`https://<ref>.supabase.co`),
sans suffixe de chemin : le client ajoute lui-même `/rest/v1`, `/auth/v1`, etc.

Scanner le QR code avec Expo Go (Android/iOS). Le squelette démarre même sans
`.env` : les appels Supabase sont simplement désactivés, et l'écran de connexion
propose une session de développement pour parcourir la navigation.

Builds iOS/Android : via **EAS Build** (build cloud, pas de Mac requis) — à
configurer le moment venu avec `pnpm dlx eas-cli build:configure`.

### Backend

```bash
cd backend
pnpm install
cp .env.example .env    # renseigner SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
pnpm run start:dev
```

L'API **refuse de démarrer** si une variable requise manque — c'est voulu.
Vérification : `curl http://localhost:3000/health` → `{"status":"ok"}`.

### Base de données

La CLI Supabase est installée à la racine :

```bash
pnpm db --help          # équivaut à `supabase --help`
pnpm db init            # à faire une fois : crée supabase/
pnpm db:diff -f <nom>   # génère une migration
pnpm db:push            # applique les migrations sur le projet distant
```

## Secrets

Aucun `.env` n'est commité. Les `.env.example` documentent les variables
attendues. La clé `service_role` de Supabase ne doit **jamais** apparaître côté
mobile : seule la clé `anon` y a sa place (elle est protégée par la RLS).

## État actuel

Squelette uniquement : navigation parcourable avec écrans placeholder côté
mobile, modules NestJS structurés mais sans implémentation. Les tables Supabase
ne sont pas encore créées.
