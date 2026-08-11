# Grindrise

Application mobile de tracking sportif avec une couche de gamification RPG
(classes, niveaux, XP, lore narratif).

## Structure du monorepo

```
mobile/     App Expo (React Native + TypeScript), organisée par feature
backend/    API NestJS (modular monolith), déployée en container sur CapRover
  worker/   emplacement du futur worker de notifications (BullMQ) — vide
supabase/   migrations SQL, seeds et tests de schéma
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

Scanner le QR code avec Expo Go (Android/iOS). L'app démarre même sans `.env`,
mais l'écran de connexion affiche alors un message de configuration manquante :
il n'existe aucun moyen d'entrer sans un projet Supabase joignable.

La connexion se fait par **code à usage unique envoyé par email**. Elle suppose
que le gabarit « Magic Link » du dashboard Supabase (Authentication > Email
Templates) contienne `{{ .Token }}` et non `{{ .ConfirmationURL }}` — sinon
l'email porte un lien et aucun code.

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
pnpm db:test            # teste le schéma et la RLS (aucun service requis)
pnpm db login           # puis: pnpm db link --project-ref <ref>
pnpm db:push            # applique les migrations sur le projet distant
pnpm db:types           # régénère supabase/database.types.ts
pnpm db:diff -f <nom>   # génère une migration à partir d'un changement local
```

`pnpm db:test` rejoue toutes les migrations dans un Postgres 17 embarqué
(PGlite, en WASM) et vérifie que les policies tiennent — notamment qu'un
client ne peut pas s'attribuer d'XP. Ni Docker ni projet distant nécessaires,
donc à lancer après **toute** modification de `supabase/migrations/`.

`pnpm db:types` écrit `supabase/database.types.ts` puis le copie dans
`backend/src/` et `mobile/src/lib/`. Ces copies sont versionnées à dessein :
le contexte de build Docker se limite à `backend/`, et Metro ne résout pas les
imports hors du dossier du projet. **À relancer après chaque migration.**

## Secrets

Aucun `.env` n'est commité. Les `.env.example` documentent les variables
attendues. La clé `service_role` de Supabase ne doit **jamais** apparaître côté
mobile : seule la clé `anon` y a sa place (elle est protégée par la RLS).

## État actuel

Squelette uniquement : navigation parcourable avec écrans placeholder côté
mobile, modules NestJS structurés mais sans implémentation. Les tables Supabase
ne sont pas encore créées.
