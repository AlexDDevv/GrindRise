# Grindrise — API (NestJS)

Modular monolith TypeScript. Porte la logique métier qui ne peut pas vivre côté
client : calcul d'XP, règles de niveaux, contenu narratif conditionnel,
réception des webhooks RevenueCat.

## Démarrer

```bash
npm install
cp .env.example .env   # puis renseigner SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
npm run start:dev
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
