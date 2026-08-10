-- Schéma cœur de Grindrise (hors tournois, différés post-MVP).
--
-- Conventions :
-- - les tables de référence (sports, classes) ont une clé primaire textuelle
--   (un slug stable) : elles sont peuplées par migration, jamais par un
--   utilisateur, et cela rend les seeds et les requêtes lisibles sans avoir à
--   résoudre des UUID ;
-- - les tables portant des données utilisateur utilisent des UUID ;
-- - tous les horodatages sont en `timestamptz`.

-- ---------------------------------------------------------------------------
-- Tables de référence
-- ---------------------------------------------------------------------------

create table public.sports (
  id text primary key,
  name text not null,
  icon text,
  created_at timestamptz not null default now()
);

comment on table public.sports is
  'Sports supportés. Lecture publique, écriture service_role uniquement.';

create table public.classes (
  id text primary key,
  -- null = classe générique, disponible quel que soit le sport pratiqué.
  sport_id text references public.sports (id) on delete cascade,
  name text not null,
  lore_intro text not null,
  created_at timestamptz not null default now()
);

comment on column public.classes.sport_id is
  'null pour une classe générique, sinon la classe n''est proposée que pour ce sport.';

create table public.level_thresholds (
  level int primary key check (level >= 1),
  -- XP TOTAL cumulé nécessaire pour atteindre ce niveau (niveau 1 = 0).
  -- Le niveau d'un profil est donc :
  --   max(level) where xp_required <= user_progress.current_xp
  xp_required int not null check (xp_required >= 0),
  title text not null,
  unlock_description text
);

comment on table public.level_thresholds is
  'Courbe de progression pilotée par les données : rééquilibrer le game design ne demande aucun redéploiement.';

-- ---------------------------------------------------------------------------
-- Profils
-- ---------------------------------------------------------------------------

create table public.profiles (
  -- Même identifiant que auth.users : c'est ce qui fait fonctionner
  -- `auth.uid() = id` dans les policies RLS.
  id uuid primary key references auth.users (id) on delete cascade,
  class_id text references public.classes (id) on delete set null,
  username text,
  created_at timestamptz not null default now(),
  constraint profiles_username_length
    check (username is null or char_length(username) between 3 and 24)
);

-- Unicité insensible à la casse : « Grind » et « grind » sont le même pseudo.
create unique index profiles_username_lower_idx
  on public.profiles (lower(username))
  where username is not null;

-- ---------------------------------------------------------------------------
-- Progression (cache dénormalisé)
-- ---------------------------------------------------------------------------

create table public.user_progress (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  level int not null default 1 check (level >= 1),
  -- XP total cumulé, et non l'XP à l'intérieur du niveau courant : c'est ce
  -- qui rend la valeur recalculable par un simple sum(xp_events.amount).
  current_xp int not null default 0 check (current_xp >= 0),
  streak_days int not null default 0 check (streak_days >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.user_progress is
  'Cache recalculable à partir de xp_events. Jamais écrit par le client — service_role uniquement.';

-- ---------------------------------------------------------------------------
-- Droits d''accès
-- ---------------------------------------------------------------------------

create type public.entitlement_plan as enum ('freemium', 'subscription', 'lifetime');

create type public.entitlement_status as enum (
  'active',
  'in_grace_period',
  'cancelled',
  'expired'
);

create table public.entitlements (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  plan public.entitlement_plan not null default 'freemium',
  status public.entitlement_status not null default 'active',
  -- null pour freemium et lifetime : seul un abonnement expire.
  expires_at timestamptz,
  revenuecat_id text,
  updated_at timestamptz not null default now()
);

comment on table public.entitlements is
  'Source de vérité des droits payants, alimentée par le webhook RevenueCat. Le SDK client sert à l''affichage, jamais à autoriser.';

-- ---------------------------------------------------------------------------
-- Séances
-- ---------------------------------------------------------------------------

create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  sport_id text not null references public.sports (id),
  performed_at timestamptz not null default now(),
  -- Forme variable selon le sport : reps/poids, distance/allure, durée…
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- Une séance dans le futur est soit une erreur de saisie, soit une
  -- tentative de contourner les plafonds d'XP journaliers.
  constraint workout_logs_not_in_future check (performed_at <= now() + interval '1 hour')
);

-- Requête la plus fréquente de l'app : l'historique d'un profil, du plus récent au plus ancien.
create index workout_logs_profile_performed_idx
  on public.workout_logs (profile_id, performed_at desc);

create index workout_logs_metrics_idx
  on public.workout_logs using gin (metrics);

-- ---------------------------------------------------------------------------
-- XP (log append-only, source de vérité)
-- ---------------------------------------------------------------------------

create type public.xp_source_type as enum (
  'workout',
  'streak',
  'achievement',
  'manual_adjustment'
);

create table public.xp_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  source_type public.xp_source_type not null,
  -- Identifiant de l'objet à l'origine du gain (workout_logs.id pour
  -- source_type = 'workout'). null pour un ajustement manuel.
  source_id uuid,
  amount int not null check (amount <> 0),
  created_at timestamptz not null default now()
);

-- Idempotence garantie par la base et pas seulement par le code applicatif :
-- rejouer l'attribution d'XP d'une séance ne peut pas créditer deux fois.
create unique index xp_events_source_unique_idx
  on public.xp_events (profile_id, source_type, source_id)
  where source_id is not null;

create index xp_events_profile_created_idx
  on public.xp_events (profile_id, created_at desc);

comment on table public.xp_events is
  'Log append-only, source de vérité de l''XP. Écrit uniquement côté serveur.';

-- Le caractère append-only est imposé par la base, pas seulement par
-- convention : la clé service_role contourne la RLS, donc une erreur de l'API
-- pourrait sinon réécrire l'historique d'XP.
create or replace function public.xp_events_enforce_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'xp_events est append-only : mise à jour interdite (id=%)', old.id
      using errcode = 'restrict_violation';
  end if;

  -- Une suppression n'est tolérée que si elle provient de la cascade
  -- déclenchée par la suppression du profil (droit à l'effacement) : dans ce
  -- cas la ligne parente a déjà disparu quand ce trigger s'exécute.
  if exists (select 1 from public.profiles where id = old.profile_id) then
    raise exception 'xp_events est append-only : suppression interdite (id=%)', old.id
      using errcode = 'restrict_violation';
  end if;

  return old;
end;
$$;

create trigger xp_events_append_only
  before update or delete on public.xp_events
  for each row execute function public.xp_events_enforce_append_only();
