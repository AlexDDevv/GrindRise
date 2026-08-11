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

Depuis la phase 2, `workout_logs` n'est plus dans la première catégorie : la
RLS n'autorise plus le mobile à y écrire. Une séance insérée en direct n'aurait
jamais d'XP mais compterait quand même pour le streak, ce qui suffisait à
contourner tout le modèle. L'écriture passe par `POST /workouts`, qui insère la
séance et son XP dans une même transaction Postgres.

## Lancer en local

### Mobile

```bash
cd mobile
pnpm install
cp .env.example .env    # URL + clé anon Supabase, et l'IP LAN de l'API
pnpm exec expo start    # -c pour vider le cache Metro après un changement de .env
```

`EXPO_PUBLIC_API_URL` ne peut **pas** être `localhost` : Expo Go tourne sur le
téléphone, pour qui `localhost` est le téléphone lui-même. Il faut l'IP LAN de
la machine de développement (`ip addr`), les deux appareils sur le même réseau.
L'API écoute déjà sur `0.0.0.0`.

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

Le flux vertical de l'XP fonctionne : logger une séance depuis le mobile fait
monter le niveau, et il n'existe aucun autre moyen d'en gagner.

- **Base** : 8 tables, RLS deny-by-default, données de référence seedées.
- **Backend** : authentification par JWT, `GET /users/me`, `POST /workouts`.
- **Mobile** : connexion OTP, choix de classe, enregistrement d'une séance.

Reste en placeholder : l'accueil, la progression et l'historique (phase 3).

### Comment l'XP est attribuée

Une séance vaut au maximum 100 XP : 60 de présence et jusqu'à 40 d'effort, sur
une courbe concave. Le barème est commun à tous les sports — seule la référence
d'effort change — pour qu'aucun ne soit mécaniquement plus rentable qu'un
autre, la courbe de niveaux étant partagée.

Anti-triche : deux séances créditées par jour, trente minutes minimum entre
deux, sept jours d'antériorité maximum. Au-delà, la séance est enregistrée mais
ne rapporte rien — l'app reste un tracker.

Le streak compte les jours **locaux** consécutifs, dans le fuseau du joueur
(`profiles.timezone`) : en UTC, il casserait à 2 h du matin en France. Les
paliers (3, 7, 14, 30 jours, puis tous les 30) versent un bonus fixe et non un
multiplicateur, qui doublerait aussi le gain d'une séance gonflée.

Ces règles vivent dans `backend/src/modules/gamification/xp-rules.ts`, en
fonctions pures testées sans base. La courbe de niveaux, elle, reste en base :
la rééquilibrer est rétroactif, `recomputeProgress` réaligne tous les niveaux
sans toucher un seul `xp_events`.

### Ce qui reste à valider à la main

Aucun appareil ni émulateur n'est disponible en développement : le rendu et le
parcours dans Expo Go n'ont jamais été joués. Voir la section « État actuel »
de `docs/ROADMAP.md` pour la liste des points à vérifier.
