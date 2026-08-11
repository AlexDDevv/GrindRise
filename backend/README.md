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

## Déploiement CapRover

Le `captain-definition` et le `Dockerfile` sont dans ce dossier : déployer
depuis `/backend` comme racine de contexte.

```bash
caprover deploy   # depuis backend/
```

Variables d'environnement à définir dans l'interface CapRover (App Configs) —
ne jamais commiter `.env`.
