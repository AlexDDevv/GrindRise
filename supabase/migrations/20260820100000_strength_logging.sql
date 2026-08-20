-- Séances de musculation structurées : catalogue d'exercices, programmes
-- réutilisables, séances loguées en exercices et séries.
--
-- Ce que remplace ce schéma : un `metrics` jsonb à trois nombres (séries,
-- répétitions, charge). Cette forme supposait que toutes les séries d'une
-- séance portent la même charge et que la séance ne comporte qu'un exercice.
-- Elle ne décrivait aucune séance réelle.
--
-- Périmètre strict : la musculation. `course`, `natation` et `cyclisme`
-- continuent d'écrire dans `workout_logs.metrics`, cette colonne ne bouge pas.
--
-- Deux principes hérités, à ne pas casser :
-- - une séance ne s'écrit que par l'API (`workouts_server_only`), donc aucune
--   policy d'écriture sur `logged_exercises` ni `logged_sets` ;
-- - `(select auth.uid())` et non `auth.uid()`, pour que Postgres mette le
--   résultat en cache sur toute la requête.

-- ---------------------------------------------------------------------------
-- Vocabulaire
-- ---------------------------------------------------------------------------

-- Enum fermé et non texte libre : un utilisateur qui nomme lui-même ses
-- groupes musculaires sur ses exercices custom rendrait tout filtre et toute
-- statistique par groupe inexploitables. Contrepartie assumée : ajouter un
-- groupe demande une migration.
create type public.muscle_group as enum (
  'pectoraux',
  'dos',
  'epaules',
  'biceps',
  'triceps',
  'avant_bras',
  'quadriceps',
  'ischios',
  'fessiers',
  'mollets',
  'abdominaux',
  'full_body'
);

-- Une série se compte en répétitions (développé couché) ou en temps (gainage).
-- Le type décide de laquelle des deux colonnes est remplie.
create type public.set_type as enum ('reps', 'time');

-- ---------------------------------------------------------------------------
-- Catalogue d'exercices
-- ---------------------------------------------------------------------------

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group public.muscle_group not null,
  -- null = exercice prédéfini par l'app, visible de tous, écrit par migration.
  -- Non nul = exercice custom, visible de son seul propriétaire.
  created_by uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint exercises_name_length check (char_length(name) between 2 and 80)
);

comment on table public.exercises is
  'Catalogue. created_by null = prédéfini (lecture par tous, écriture service_role) ; non nul = custom, privé à son auteur.';

-- Deux index uniques partiels plutôt qu'un seul, parce qu'ils règlent deux
-- problèmes distincts : le premier rend la migration de seed rejouable en
-- `on conflict do update`, le second empêche un utilisateur de créer deux fois
-- « Curl marteau » sans lui interdire d'avoir un homonyme d'un prédéfini.
create unique index exercises_predefined_name_idx
  on public.exercises (lower(name))
  where created_by is null;

create unique index exercises_custom_name_idx
  on public.exercises (created_by, lower(name))
  where created_by is not null;

create index exercises_muscle_group_idx on public.exercises (muscle_group);

-- ---------------------------------------------------------------------------
-- Programmes
-- ---------------------------------------------------------------------------

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  sport_id text not null references public.sports (id),
  name text not null,
  created_at timestamptz not null default now(),
  constraint programs_name_length check (char_length(name) between 1 and 80)
);

-- Pas d'unicité sur (profile_id, sport_id) : plusieurs programmes de
-- musculation coexistent, c'est même l'usage attendu (prise de masse, sèche…).
create index programs_profile_idx on public.programs (profile_id);

create table public.program_workouts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  -- « Jour Push », « Jour Jambes »…
  name text not null,
  order_index int not null check (order_index >= 0),
  constraint program_workouts_name_length check (char_length(name) between 1 and 80),
  constraint program_workouts_order_unique unique (program_id, order_index)
);

-- La contrainte d'unicité est nue, non deferrable — même convention que
-- `narrative_beats_track_order_unique`. C'est tenable parce qu'aucun endpoint
-- ne réordonne en place : on ajoute en `max + 1`, et remplacer la liste
-- d'exercices d'un jour est un delete suivi d'un insert dans la même
-- transaction, donc sans instant où deux lignes partagent un rang.

create table public.program_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  program_workout_id uuid not null
    references public.program_workouts (id) on delete cascade,
  -- Pas d'action de suppression déclarée, donc `no action` : voir le
  -- commentaire sur `logged_exercises` plus bas, c'est le même piège.
  exercise_id uuid not null references public.exercises (id),
  order_index int not null check (order_index >= 0),
  constraint program_workout_exercises_order_unique
    unique (program_workout_id, order_index)
);

comment on table public.program_workout_exercises is
  'Squelette d''un jour type : une liste ordonnée d''exercices, sans cible de séries ni de répétitions. Volontairement pauvre pour le MVP.';

create index program_workout_exercises_exercise_idx
  on public.program_workout_exercises (exercise_id);

-- ---------------------------------------------------------------------------
-- Séances loguées
-- ---------------------------------------------------------------------------

-- `set null` et non `cascade` : supprimer un programme ne doit pas effacer les
-- séances faites en le suivant. La séance redevient simplement une séance
-- libre — ce qu'elle est de toute façon une fois le gabarit disparu.
alter table public.workout_logs
  add column program_workout_id uuid
    references public.program_workouts (id) on delete set null;

comment on column public.workout_logs.program_workout_id is
  'Jour type suivi par cette séance, ou null si elle est libre. Mis à null si le programme est supprimé : l''historique survit au gabarit.';

create table public.logged_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_log_id uuid not null
    references public.workout_logs (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  order_index int not null check (order_index >= 0),
  constraint logged_exercises_order_unique unique (workout_log_id, order_index)
);

-- Pourquoi `exercise_id` n'est PAS en `on delete restrict`.
--
-- Supprimer un profil déclenche deux cascades qui se croisent : d'un côté
-- `workout_logs → logged_exercises`, de l'autre les exercices custom du profil
-- (`exercises.created_by on delete cascade`). Avec `restrict`, la vérification
-- est immédiate et ne peut pas attendre : selon l'ordre dans lequel Postgres
-- déclenche ses triggers d'intégrité, la suppression du compte échouerait.
--
-- `no action` — le défaut, donc l'absence de clause ci-dessus — repousse la
-- vérification à la fin de l'instruction, quand les lignes référençantes ont
-- déjà disparu. Le comportement voulu est conservé : on ne peut pas supprimer
-- un exercice encore utilisé. Et le droit à l'effacement continue de
-- fonctionner. C'est prouvé par un test, pas seulement par ce raisonnement.

create index logged_exercises_exercise_idx
  on public.logged_exercises (exercise_id);

create table public.logged_sets (
  id uuid primary key default gen_random_uuid(),
  logged_exercise_id uuid not null
    references public.logged_exercises (id) on delete cascade,
  set_index int not null check (set_index >= 0),
  type public.set_type not null,
  reps int check (reps > 0),
  duration_seconds int check (duration_seconds > 0),
  -- Charge externe, ou lest additionnel quand `is_bodyweight` est vrai. Une
  -- traction au poids du corps sans lest a donc `weight_kg` null.
  weight_kg numeric(6, 2) check (weight_kg >= 0),
  is_bodyweight boolean not null default false,

  constraint logged_sets_index_unique unique (logged_exercise_id, set_index),

  -- Sans cette contrainte, la table accepte une série vide : un `type` qui ne
  -- correspond à aucune valeur renseignée. C'est elle qui donne son sens au
  -- champ `type` plutôt que d'en faire une étiquette décorative.
  constraint logged_sets_shape_matches_type check (
    (type = 'reps' and reps is not null and duration_seconds is null)
    or
    (type = 'time' and duration_seconds is not null and reps is null)
  )
);

comment on table public.logged_sets is
  'Séries d''un exercice logué. Écriture par l''API seule, comme workout_logs.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.exercises                 enable row level security;
alter table public.programs                  enable row level security;
alter table public.program_workouts          enable row level security;
alter table public.program_workout_exercises enable row level security;
alter table public.logged_exercises          enable row level security;
alter table public.logged_sets               enable row level security;

-- Catalogue.
--
-- `authenticated` seul, sans `anon` : contrairement à `sports` et `classes`,
-- le catalogue ne sert à aucun écran d'avant-connexion.
--
-- Les policies d'écriture portent le prédicat en `using` ET en `with check`, et
-- les deux sont nécessaires pour des raisons différentes : sans `with check`,
-- on modifie l'exercice d'autrui vers soi ; sans `using`, on promeut son propre
-- exercice en prédéfini (`created_by = null`), donc on le rend visible de tous
-- les utilisateurs de l'app. Les deux côtés sont testés.

create policy "exercises_select_visible"
  on public.exercises for select
  to authenticated
  using (created_by is null or created_by = (select auth.uid()));

create policy "exercises_insert_own"
  on public.exercises for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy "exercises_update_own"
  on public.exercises for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "exercises_delete_own"
  on public.exercises for delete
  to authenticated
  using (created_by = (select auth.uid()));

-- Programmes : propriétaire en lecture et en écriture.
--
-- Ils n'ont aucune valeur de jeu — un programme ne rapporte pas d'XP — donc la
-- règle du récap s'applique : le CRUD simple peut passer Mobile → Supabase.
-- L'API expose quand même des endpoints, pour porter les validations d'ordre.

create policy "programs_select_own"
  on public.programs for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy "programs_insert_own"
  on public.programs for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

create policy "programs_update_own"
  on public.programs for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "programs_delete_own"
  on public.programs for delete
  to authenticated
  using (profile_id = (select auth.uid()));

-- Tables enfants : le prédicat remonte jusqu'au `profile_id` porteur, jamais
-- seulement jusqu'au parent immédiat. Vérifier l'existence du parent sans
-- vérifier à qui il appartient rendrait la ligne lisible par n'importe qui.

create policy "program_workouts_all_own"
  on public.program_workouts for all
  to authenticated
  using (
    exists (
      select 1 from public.programs p
      where p.id = program_id and p.profile_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.programs p
      where p.id = program_id and p.profile_id = (select auth.uid())
    )
  );

create policy "program_workout_exercises_all_own"
  on public.program_workout_exercises for all
  to authenticated
  using (
    exists (
      select 1
      from public.program_workouts pw
      join public.programs p on p.id = pw.program_id
      where pw.id = program_workout_id and p.profile_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.program_workouts pw
      join public.programs p on p.id = pw.program_id
      where pw.id = program_workout_id and p.profile_id = (select auth.uid())
    )
  );

-- Séances : LECTURE SEULE pour le client.
--
-- Aucune policy d'écriture, et c'est la continuité directe de
-- `workouts_server_only` : une séance à moitié écrite, ou complétée après coup
-- hors API, rouvrirait exactement le raisonnement que cette migration a fermé.
-- L'API écrit par RPC, avec la clé service_role qui contourne la RLS.

create policy "logged_exercises_select_own"
  on public.logged_exercises for select
  to authenticated
  using (
    exists (
      select 1 from public.workout_logs w
      where w.id = workout_log_id and w.profile_id = (select auth.uid())
    )
  );

create policy "logged_sets_select_own"
  on public.logged_sets for select
  to authenticated
  using (
    exists (
      select 1
      from public.logged_exercises le
      join public.workout_logs w on w.id = le.workout_log_id
      where le.id = logged_exercise_id and w.profile_id = (select auth.uid())
    )
  );
