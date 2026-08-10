-- Row Level Security, deny-by-default.
--
-- RLS est activée sur TOUTES les tables : sans policy correspondante, une
-- action est refusée. Ce qui n'apparaît pas ici est donc interdit.
--
-- La clé service_role contourne la RLS : ces policies protègent le client
-- mobile (clé anon), pas l'API. C'est voulu — l'API est justement le seul
-- chemin autorisé pour écrire l'XP et les droits payants.
--
-- `(select auth.uid())` plutôt que `auth.uid()` : Postgres met alors le
-- résultat en cache pour toute la requête au lieu de le réévaluer par ligne.

alter table public.sports            enable row level security;
alter table public.classes           enable row level security;
alter table public.level_thresholds  enable row level security;
alter table public.profiles          enable row level security;
alter table public.user_progress     enable row level security;
alter table public.entitlements      enable row level security;
alter table public.workout_logs      enable row level security;
alter table public.xp_events         enable row level security;

-- ---------------------------------------------------------------------------
-- Tables de référence : lecture publique, écriture service_role uniquement
-- ---------------------------------------------------------------------------

create policy "sports_select_public"
  on public.sports for select
  to anon, authenticated
  using (true);

create policy "classes_select_public"
  on public.classes for select
  to anon, authenticated
  using (true);

create policy "level_thresholds_select_public"
  on public.level_thresholds for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- profiles : le propriétaire lit et écrit son profil
-- ---------------------------------------------------------------------------

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Pas de policy INSERT : la ligne est créée par le trigger sur auth.users.
-- Pas de policy DELETE : supprimer son compte passe par la suppression de
-- l'utilisateur auth, qui cascade jusqu'ici.

-- ---------------------------------------------------------------------------
-- workout_logs : le propriétaire gère ses séances
-- ---------------------------------------------------------------------------

create policy "workout_logs_select_own"
  on public.workout_logs for select
  to authenticated
  using ((select auth.uid()) = profile_id);

create policy "workout_logs_insert_own"
  on public.workout_logs for insert
  to authenticated
  with check ((select auth.uid()) = profile_id);

create policy "workout_logs_update_own"
  on public.workout_logs for update
  to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

create policy "workout_logs_delete_own"
  on public.workout_logs for delete
  to authenticated
  using ((select auth.uid()) = profile_id);

-- ---------------------------------------------------------------------------
-- Lecture seule pour le client : tout ce qui a une valeur de jeu ou d'argent
-- ---------------------------------------------------------------------------

-- Aucune policy d'écriture ci-dessous : c'est le cœur du modèle anti-triche.
-- Un client qui tente un insert dans xp_events doit échouer.

create policy "user_progress_select_own"
  on public.user_progress for select
  to authenticated
  using ((select auth.uid()) = profile_id);

create policy "xp_events_select_own"
  on public.xp_events for select
  to authenticated
  using ((select auth.uid()) = profile_id);

create policy "entitlements_select_own"
  on public.entitlements for select
  to authenticated
  using ((select auth.uid()) = profile_id);
