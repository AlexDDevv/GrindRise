# Grindrise — API (NestJS)

Modular monolith TypeScript. Porte la logique métier qui ne peut pas vivre côté
client : calcul d'XP, règles de niveaux, contenu narratif conditionnel,
réception des webhooks RevenueCat.

## Démarrer

```bash
pnpm install
cp .env.example .env   # puis renseigner SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
pnpm run start:dev
```

L'app **refuse de démarrer** si une variable requise manque (`src/config/env.config.ts`) —
c'est voulu : un container mal configuré doit échouer au boot, pas au premier
appel base.

Vérification : `curl http://localhost:3000/health` → `{"status":"ok"}`

## Structure

```
src/
  config/      validation des variables d'environnement
  supabase/    client service_role (contourne la RLS — usage serveur strict)
  auth/        guard global : vérifie le JWT Supabase, expose @CurrentUser()
  health/      sonde de vie du container
  modules/
    users/           profils
    workouts/        logs d'entraînement
    gamification/    XP, niveaux, anti-triche
    narrative/       trames, déblocage des beats, codex
    entitlements/    webhook RevenueCat, droits d'accès
worker/        emplacement du futur worker de notifications (voir son README)
```

Chaque module expose son service via `exports` ; aucun module n'importe les
providers internes d'un autre. C'est ce qui rendra une extraction ultérieure
mécanique.

## Authentification

Toute route est protégée par défaut : `SupabaseAuthGuard` est enregistré en
`APP_GUARD`, donc appliqué à l'ensemble de l'application, y compris aux
endpoints ajoutés plus tard. Le JWT est vérifié **localement** contre le JWKS
public du projet — pas d'aller-retour réseau par requête.

Une route ne s'ouvre qu'en portant `@Public()`, et ce décorateur oblige à dire
par quoi elle est protégée à la place (`/health` par rien, le webhook
RevenueCat par son secret partagé).

L'identité s'obtient par `@CurrentUser()`. Son champ `id` **est** le
`profile_id` : `profiles.id` référence `auth.users(id)`. Aucun handler ne doit
lire un identifiant d'utilisateur depuis le corps ou l'URL de la requête.

## Règles non négociables

- Le client n'envoie **jamais** de montant d'XP. Il envoie une séance, le
  serveur en déduit l'XP (`GamificationService`).
- `xp_events` est append-only et n'est écrit que par l'API.
- `user_progress` est un cache recalculable depuis `xp_events`.
- `entitlements` n'est écrit que par le webhook RevenueCat. Le SDK client sert
  à l'affichage, jamais à autoriser une fonctionnalité payante.

Le `ValidationPipe` global tourne en `forbidNonWhitelisted` : un champ non
déclaré dans un DTO fait **échouer** la requête au lieu d'être ignoré. C'est ce
qui rend visible un `xp` envoyé par un client malveillant. Si un DTO se heurte
à cette validation, c'est le DTO qu'on corrige — jamais le réglage du pipe.

## Enregistrement d'une séance

`POST /workouts` insère `workout_logs`, `xp_events` et met à jour
`user_progress`. PostgREST ne sait pas enchaîner ces trois écritures dans une
transaction, et une interruption au milieu laisserait une séance sans XP que
`recomputeProgress` ne rattraperait pas — il recalcule le cache depuis
`xp_events`, il ne peut pas inventer l'événement manquant. Tout part donc
ensemble, par la fonction Postgres `log_workout_with_xp`.

Cette fonction ne porte **aucune règle de game design** : elle reçoit des
montants déjà calculés et des plafonds sous forme de nombres. Ce qu'elle
apporte, c'est l'atomicité et un verrou par profil, sans lequel deux requêtes
simultanées franchiraient le plafond journalier ensemble. Le barème, lui, vit
en fonctions pures dans `modules/gamification/xp-rules.ts`.

`EXECUTE` sur cette fonction est révoqué pour `anon` et `authenticated` :
Postgres l'accorde à `PUBLIC` par défaut, et sans cette révocation le mobile
pourrait l'appeler avec le montant de son choix. Un test PGlite le vérifie.

Un conflit sur l'index unique `(profile_id, source_type, source_id)` signifie
« déjà crédité », pas « erreur » : il est traité comme tel, jamais remonté en
500.

## Déblocage narratif

Deux axes de contenu, deux sources de déclenchement :

| Trame | Trigger | Source |
|---|---|---|
| Principale (`track = 'main'`) | `global_level` | `user_progress.level` |
| Annexe (`track = 'sport:<id>'`) | `sport_sessions_count` | `count(workout_logs)` du sport |

**La classe du joueur ne participe pas au déblocage.** Elle est choisie une fois
à la création, ne change jamais, et ne pilote que le ton de la trame principale.
Une trame annexe s'ouvre parce que le sport est pratiqué — c'est ce qui permet à
un triathlète de garder une seule classe tout en ouvrant trois voies. Le type
`PlayerNarrativeState` ne porte donc ni `class_id` ni rien qui s'en approche :
si la classe apparaît un jour dans ce calcul, c'est une régression.

Un déblocage est un **événement explicite** écrit dans `user_narrative_unlocks`,
jamais déduit à l'affichage — même logique que `xp_events`. Sans ça,
`unlocked_at` ne voudrait rien dire et « jamais vu » deviendrait indiscernable de
« déjà lu ». La clé primaire composite `(profile_id, beat_id)` rend la
synchronisation rejouable sans précaution.

`NarrativeService.syncUnlocks()` est appelée après l'enregistrement d'une séance,
**hors de sa transaction et en best-effort** : à ce moment-là l'XP est déjà
créditée, et remonter une panne narrative en 500 ferait ressaisir une séance qui
serait alors refusée comme trop rapprochée. Le rattrapage n'est pas laissé au
hasard pour autant — `getState()` resynchronise à chaque consultation du codex.

| Route | Effet |
|---|---|
| `GET /narrative` | État groupé par trame. Ne renvoie **que** les beats débloqués |
| `POST /narrative/beats/:beatId/read` | Date la première consultation. Idempotent, 404 sur un beat non débloqué |

`narrative_beats` est en lecture publique, comme les autres tables de contenu :
un client déterminé peut donc lire du texte non débloqué directement en base.
L'API, elle, ne sert jamais un fragment non gagné. Si le spoil devient un vrai
sujet, la policy peut être resserrée aux beats présents dans
`user_narrative_unlocks` sans rien casser côté mobile, qui passe déjà par l'API.

## Déploiement CapRover

Le `captain-definition` et le `Dockerfile` sont dans ce dossier : déployer
depuis `/backend` comme racine de contexte.

```bash
caprover deploy   # depuis backend/
```

Variables d'environnement à définir dans l'interface CapRover (App Configs) —
ne jamais commiter `.env`.
