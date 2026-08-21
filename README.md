# Grindrise

Application mobile de tracking sportif avec une couche de gamification RPG
(classes, niveaux, XP, lore narratif).

## Structure du monorepo

```
mobile/     App Expo (React Native + TypeScript), organisée par feature
backend/    API NestJS (modular monolith), déployée en container sur CapRover
supabase/   migrations SQL, seeds et tests de schéma
```

Un troisième déployable vit **hors de ce dépôt** :
[grindrise-notifications](https://github.com/AlexDDevv/grindrise-notifications),
qui consomme une queue BullMQ et envoie les emails transactionnels. L'API n'y
accède que par Redis, jamais en HTTP.

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
- **API NestJS → service de notifications** (queue Redis/BullMQ) : tout envoi
  d'email. L'API dépose un job et n'attend aucune réponse — un envoi lent ou en
  panne ne doit jamais peser sur une requête utilisateur.

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

Scanner le QR code avec Expo Go (Android/iOS) — mais Expo Go n'exécute que le
SDK le plus récent, et un appareil que son constructeur ne met plus à jour en
reçoit une version trop ancienne, ce qui rend le projet « incompatible ». La
solution de repli est l'émulateur Android : voir `docs/emulateur-android-wsl.md`.

L'app démarre même sans `.env`, mais l'écran de connexion affiche alors un
message de configuration manquante : il n'existe aucun moyen d'entrer sans un
projet Supabase joignable.

La connexion se fait par **code à usage unique envoyé par email**, acheminé par
le relais SMTP Brevo branché sur Supabase Auth. Les **deux** gabarits concernés
portent `{{ .Token }}` et aucun lien : « Confirm signup » sert à la première
demande d'un compte inexistant, « Magic Link » à toutes les suivantes.

Builds iOS/Android : via **EAS Build** (build cloud, pas de Mac requis).
`mobile/eas.json` définit trois profils, choisis par `--profile` — il n'y a
aucun fichier à éditer à la main avant un build :

```bash
cd mobile
pnpm build:dev       # dev-client, distribution interne
pnpm build:preview   # build interne installable, API de production
pnpm build:prod      # build de store, API de production
```

`EXPO_PUBLIC_API_URL` n'est **pas lue au démarrage** : Expo l'inline dans le
bundle au moment du build. Comme `mobile/.env` est gitignoré, il n'est pas
envoyé aux serveurs EAS — les valeurs des builds viennent du champ `env` de
chaque profil d'`eas.json`, pas du `.env`. Une variable absente au build donne
un binaire durablement cassé : `isApiConfigured` passe à false et `apiRequest`
échoue sans tenter le réseau, ce qui ne se voit qu'une fois l'app installée.

Le profil `development` ne fige aucune `EXPO_PUBLIC_*` : un build dev-client
charge son bundle depuis le Metro local, donc depuis le `.env` de la machine.

Restent à faire avant le premier build : lier le projet à un compte EAS
(`pnpm dlx eas-cli init`, qui écrit `extra.eas.projectId` et `owner` dans
`app.json`) et décider où vivent les deux variables Supabase, aujourd'hui
absentes des profils — voir la fin de `mobile/.env.example`.

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

## Déployer

Voir [`DEPLOIEMENT.md`](DEPLOIEMENT.md) : les deux environnements (production et
test), les migrations Supabase, la configuration auth, l'API sur CapRover et le
pointage du mobile. La plateforme partagée — VPS, CapRover, DNS, Redis, Brevo —
est documentée dans le dépôt
[grindrise-notifications](https://github.com/AlexDDevv/grindrise-notifications).

## Secrets

Aucun `.env` n'est commité. Les `.env.example` documentent les variables
attendues. La clé `service_role` de Supabase ne doit **jamais** apparaître côté
mobile : seule la clé `anon` y a sa place (elle est protégée par la RLS).

## État actuel

Le flux vertical de l'XP fonctionne : logger une séance depuis le mobile fait
monter le niveau, et il n'existe aucun autre moyen d'en gagner.

- **Base** : 16 tables, RLS deny-by-default, données de référence seedées.
- **Backend** : authentification par JWT, `GET /users/me`, `POST /workouts`,
  déblocage narratif (`/narrative`), catalogue d'exercices (`/exercises`) et
  programmes d'entraînement (`/programs`, `/program-workouts`).
- **Mobile** : onboarding complet (bienvenue, sport, classe, connexion OTP),
  accueil branché sur la progression, enregistrement d'une séance avec annonce
  du palier franchi et des fragments ouverts, profil en lecture seule. Trois
  onglets : Accueil, Séance, Profil.

L'habillage suit le thème « Braise & parchemin » (`mobile/src/theme/`) : aucune
couleur, taille ni marge en dur ailleurs dans l'app.

Reste à faire côté mobile : le codex dans la barre d'onglets, l'historique
filtrable, les analytics de progression, la saisie du pseudo. Et le contenu
narratif lui-même : `narrative_beats` est vide, donc le déblocage fonctionne mais
n'a encore rien à ouvrir.

### Comment l'XP est attribuée

Une séance vaut au maximum 100 XP : 60 de présence et jusqu'à 40 d'effort, sur
une courbe concave. Le barème est commun aux sports d'endurance — seule la
référence d'effort change — pour qu'aucun ne soit mécaniquement plus rentable
qu'un autre, la courbe de niveaux étant partagée.

**La musculation fait exception depuis la refonte de son logging : elle vaut sa
présence seule, soit 60 XP.** Son effort se mesurait au tonnage — la métrique
la plus facile à gonfler de l'application — et l'y laisser revenait à payer le
mensonge. Le volume sera récompensé par des achievements ponctuels, jamais par
ce barème. Une séance de musculation se logue en exercices et séries
(`logged_exercises` / `logged_sets`), plus en trois nombres.

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

Un émulateur Android est désormais disponible et l'app y démarre — voir
`docs/emulateur-android-wsl.md`. Le parcours de connexion, lui, a été prouvé
hors mobile (appels directs à l'API auth) puis depuis l'app en version web ; il
reste à le rejouer dans l'émulateur. Les performances réelles, le rendu sur
écran physique et le comportement d'un binaire signé attendent le premier build
EAS. Voir la section « État actuel » de `docs/ROADMAP.md`.
