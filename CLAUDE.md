# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Grindrise : app mobile de tracking sportif avec gamification RPG (classes, niveaux, XP, lore). Le code, les commentaires, la doc et les messages de commit sont **en français**.

## Monorepo (sans workspace pnpm)

```
mobile/     Expo SDK 57 (React Native + TS), organisé par feature (src/features/<feature>/)
backend/    API NestJS 11, modular monolith, container sur CapRover
supabase/   migrations SQL, templates d'email auth, tests de schéma PGlite
```

`mobile/` et `backend/` s'installent **indépendamment** (`pnpm install` dans chacun) ; le `package.json` racine ne porte que la CLI Supabase. Un troisième déployable, le worker d'emails `grindrise-notifications`, vit dans un autre dépôt et n'est joint que via Redis/BullMQ.

`mobile/AGENTS.md` : Expo a changé — lire la doc versionnée https://docs.expo.dev/versions/v57.0.0/ avant d'écrire du code mobile.

## Commandes

```bash
# Racine — base de données
pnpm db:test            # rejoue toutes les migrations dans Postgres 17 embarqué (PGlite) et teste la RLS
pnpm db:types           # régénère database.types.ts et le copie dans backend/src/ et mobile/src/lib/
pnpm db:push            # applique les migrations sur le projet lié
# NE JAMAIS lancer `pnpm db:reset` (drop la base du projet lié) ni `supabase config push`.

# backend/
pnpm run start:dev      # refuse de démarrer si une variable requise manque (src/config/env.config.ts)
pnpm test               # unitaires : src/**/*.spec.ts
pnpm test -- xp-rules   # un seul fichier (filtre par chemin) ; ajouter -t "<nom>" pour un seul test
pnpm run test:e2e       # test/*.e2e-spec.ts — env factice posé par test/setup-env.ts, JWKS simulé
pnpm run lint           # eslint --fix
pnpm run build

# mobile/
pnpm exec expo start    # -c pour vider le cache Metro après un changement de .env
pnpm test               # jest-expo, fichiers *.test.ts(x) ; `pnpm test -- sessionState` pour un seul
pnpm exec tsc --noEmit  # typecheck (pas de script dédié)
```

Après **toute** modification de `supabase/migrations/` : `pnpm db:test`, puis `pnpm db:types` (les copies des types sont versionnées à dessein — le contexte Docker se limite à `backend/` et Metro ne résout rien hors de `mobile/`). Les migrations sont nommées `YYYYMMDDHHMMSS_<sujet>.sql`.

Pas d'appareil physique : la vérification mobile se fait sur émulateur Android (`docs/emulateur-android-wsl.md`) ou en version web. `EXPO_PUBLIC_API_URL` doit être l'IP LAN, jamais `localhost`.

## Architecture

**Deux chemins réseau depuis le mobile.**
- Mobile → Supabase direct (clé `anon`, RLS deny-by-default) : lectures et CRUD simples (`mobile/src/lib/supabase.ts`).
- Mobile → API NestJS (`mobile/src/lib/api.ts`, jeton lu depuis `useUserStore`, seule source de vérité de la session) : tout ce qui a une valeur de jeu — XP, niveaux, narratif, entitlements.
- API → worker de notifications : uniquement par job BullMQ, jamais en HTTP.

**Invariants anti-triche (non négociables).**
- Le client n'écrit jamais d'XP : il envoie une séance, le serveur en déduit l'XP. `workout_logs` n'est plus inscriptible par le mobile (RLS) ; `POST /workouts` passe par la fonction Postgres `log_workout_with_xp` (atomicité + verrou par profil). Cette fonction ne contient **aucune règle de game design** : elle reçoit des montants déjà calculés. `EXECUTE` y est révoqué pour `anon`/`authenticated` — à reproduire sur toute nouvelle fonction RPC sensible, et à tester dans `supabase/tests/schema.test.mjs`.
- `xp_events` est append-only ; `user_progress` est un cache recalculable (`recomputeProgress`). Conflit sur `(profile_id, source_type, source_id)` = « déjà crédité », pas une 500.
- `entitlements` n'est écrit que par le webhook RevenueCat ; le SDK client ne sert qu'à l'affichage.
- Le barème vit en fonctions pures, testées sans base : `backend/src/modules/gamification/xp-rules.ts` (et `local-day.ts` pour le streak en jour local du fuseau `profiles.timezone`). La courbe de niveaux, elle, est en base. La musculation ne vaut que sa présence (60 XP) ; elle se logue en `logged_exercises` / `logged_sets`.
- Narratif : la **classe ne participe jamais au déblocage** (trame principale ← `user_progress.level`, trames annexes `sport:<id>` ← nombre de séances du sport). Un déblocage est un événement écrit dans `user_narrative_unlocks`, jamais déduit à l'affichage. `narrative_beats` n'est pas en lecture publique.
- Effets secondaires après une séance (`syncUnlocks`, notifications) : hors transaction et best-effort — l'XP est déjà créditée, une 500 ferait ressaisir une séance que l'anti-triche refuserait.

**Backend.**
- `SupabaseAuthGuard` est un `APP_GUARD` global : tout est protégé par défaut, JWT vérifié localement contre le JWKS. Ouvrir une route exige `@Public()` en disant ce qui la protège à la place. L'identité vient de `@CurrentUser()` (`id` = `profile_id`) ; ne jamais lire un id utilisateur depuis le corps ou l'URL.
- `ValidationPipe` global en `forbidNonWhitelisted` : si un DTO se heurte à la validation, on corrige le DTO, jamais le pipe.
- Modules étanches : ils communiquent via leurs services exportés, jamais en important les providers internes d'un autre.
- Le client Supabase serveur utilise `service_role` (contourne la RLS). Cette clé ne doit jamais apparaître côté mobile.
- `REDIS_URL` est optionnelle (producteur silencieux sans elle) ; les autres variables sont requises.
- `backend/src/modules/notifications/contract.ts` est identique octet pour octet à `src/queue/contract.ts` du dépôt notifications et n'importe rien. Toute modification se porte des deux côtés, et le worker se déploie **avant** l'API.

**Mobile.**
- Navigation : `src/navigation/` (`RootNavigator` → onboarding ou `MainTabs`). État global en zustand (`src/store/userStore.ts`, stores par feature comme `onboardingStore`).
- Thème « Braise & parchemin » dans `src/theme/` : **aucune couleur, taille ni marge en dur** ailleurs dans l'app. Les valeurs issues de maquettes s'arrondissent à l'échelle existante.
- Les `EXPO_PUBLIC_*` sont inlinées au build : pour EAS, elles viennent du champ `env` de chaque profil d'`eas.json`, pas du `.env` (gitignoré). Détails : `docs/builds-eas.md`.
- Connexion par OTP email (Supabase Auth + SMTP Brevo) ; les templates `supabase/templates/` portent `{{ .Token }}` et aucun lien.

## Déploiement

Tout est dans `DEPLOIEMENT.md` (deux environnements, production et test, sur le même VPS/CapRover). L'API se déploie **depuis la racine** : `caprover deploy -n grindrise -a api-test -b main` (test) ou `-a api` (production). Préférer l'environnement de test pour toute séance d'essai : en production, une fausse séance crédite de l'XP réelle, irréversiblement. Le quota Brevo (300 emails/jour) est partagé entre environnements ; `POST /auth/v1/admin/generate_link` donne un OTP sans envoyer d'email.

## Conventions de commit

Conventional Commits en français, portée par déployable (`feat(api):`, `fix(mobile):`, `feat(db):`, `test(api):`, `build:`, `docs:`), sujet qui décrit l'intention. Un commit = une intention ; la régénération des types fait l'objet de son propre commit `build:`.
