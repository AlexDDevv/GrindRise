-- Système narratif : les beats et leur déblocage par joueur.
--
-- Deux axes de contenu, et un seul principe à ne jamais casser :
--
--   la classe du joueur est une identité fixe, choisie à la création. Elle ne
--   participe PAS au déblocage. Une trame annexe s'ouvre parce que le joueur
--   pratique le sport (`workout_logs` filtré par `sport_id`), pas parce que sa
--   classe y correspond.
--
-- C'est ce qui règle le cas du triathlète : une seule classe, trois trames
-- annexes ouvertes en s'entraînant dans les trois sports. Rien dans ce fichier
-- ne référence `profiles.class_id`, et c'est volontaire — si une jointure vers
-- les classes apparaît un jour ici, c'est que l'invariant est tombé.
--
-- `user_narrative_unlocks` suit la même logique que `xp_events` : un déblocage
-- est un événement explicite, écrit par l'API, jamais déduit à la volée à
-- l'affichage. Sans ça, `unlocked_at` n'aurait aucun sens et le mobile ne
-- pourrait pas distinguer « jamais vu » de « déjà lu ».

-- ---------------------------------------------------------------------------
-- Beats narratifs (contenu, écrit par nous)
-- ---------------------------------------------------------------------------

create table public.narrative_beats (
  id uuid primary key default gen_random_uuid(),
  -- 'main' pour la trame principale, 'sport:<sport_id>' pour une trame annexe.
  -- Un identifiant textuel plutôt qu'une FK vers `sports` : la trame principale
  -- n'appartient à aucun sport, et une colonne nullable rendrait indécidable la
  -- différence entre « trame principale » et « annexe mal renseignée ».
  track text not null,
  -- Ordre de lecture à l'intérieur d'une trame. Distinct du trigger : deux
  -- beats peuvent ouvrir au même palier, l'ordre reste défini.
  order_index int not null check (order_index >= 1),
  trigger_type text not null
    check (trigger_type in ('global_level', 'sport_sessions_count')),
  trigger_value int not null check (trigger_value >= 1),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),

  -- Un beat de trame principale se déclenche au niveau global, un beat annexe
  -- au nombre de séances du sport. Les croiser ne veut rien dire : une trame
  -- annexe ouverte par le niveau global s'ouvrirait sans que le sport ait
  -- jamais été pratiqué, ce qui est exactement l'erreur que ce schéma refuse.
  constraint narrative_beats_track_trigger_coherent check (
    (track = 'main' and trigger_type = 'global_level')
    or (track like 'sport:%' and trigger_type = 'sport_sessions_count')
  ),

  constraint narrative_beats_track_order_unique unique (track, order_index)
);

-- Le sport visé, extrait du track, pour que la base puisse le vérifier.
--
-- Sans cette colonne, un beat sur 'sport:quiddich' serait accepté et resterait
-- invisible à jamais — une faute de frappe silencieuse dans du contenu qu'on
-- importe en masse. Générée plutôt que saisie : elle ne peut pas diverger du
-- track, donc il n'y a rien à garder en cohérence.
alter table public.narrative_beats
  add column sport_id text
    generated always as (nullif(split_part(track, ':', 2), '')) stored
    references public.sports (id);

-- Le complément du CHECK ci-dessus : 'sport:' tout court passerait la
-- contrainte `like` mais ne désignerait aucun sport.
alter table public.narrative_beats
  add constraint narrative_beats_sport_required check (
    (track = 'main' and sport_id is null)
    or (track <> 'main' and sport_id is not null)
  );

-- Lecture la plus fréquente : tous les beats d'un profil, à comparer à son
-- état. La table est petite (quelques dizaines de lignes) mais lue à chaque
-- séance enregistrée.
create index narrative_beats_track_order_idx
  on public.narrative_beats (track, order_index);

comment on table public.narrative_beats is
  'Contenu narratif. Lecture publique, écriture service_role uniquement. Le déblocage ne dépend jamais de la classe du joueur.';

comment on column public.narrative_beats.track is
  '''main'' pour la trame principale, ''sport:<sport_id>'' pour une trame annexe.';

comment on column public.narrative_beats.trigger_value is
  'Niveau global à atteindre (trame principale) ou nombre de séances du sport (trame annexe).';

-- ---------------------------------------------------------------------------
-- Déblocages par joueur (log d'événements)
-- ---------------------------------------------------------------------------

create table public.user_narrative_unlocks (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  beat_id uuid not null references public.narrative_beats (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  -- Null tant que le joueur ne l'a pas ouvert. C'est ce qui décide de
  -- l'affichage en popup : un beat déjà lu ne se represente jamais de lui-même.
  read_at timestamptz,

  -- Clé composite plutôt qu'un id de synthèse : elle rend le doublon impossible
  -- au niveau base, comme `xp_events_source_unique_idx` le fait pour l'XP. La
  -- synchronisation des déblocages devient donc rejouable sans précaution.
  primary key (profile_id, beat_id)
);

-- Pas d'index supplémentaire : la seule requête est « les déblocages d'un
-- profil », et `profile_id` est déjà la colonne de tête de la clé primaire.

comment on table public.user_narrative_unlocks is
  'Déblocages narratifs, écrits par l''API après un événement de progression. Lecture par le propriétaire, écriture service_role uniquement.';

comment on column public.user_narrative_unlocks.read_at is
  'Horodatage de la première consultation. Null = le beat doit encore être présenté en popup.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.narrative_beats          enable row level security;
alter table public.user_narrative_unlocks   enable row level security;

-- Même pattern que `sports` et `level_thresholds` : du contenu de référence.
--
-- Contrepartie assumée et connue : la lecture publique expose `body`, donc un
-- client curieux peut lire toute l'histoire sans l'avoir débloquée. La
-- protection n'est pas ici mais dans l'API, qui ne renvoie que les beats
-- effectivement débloqués. Si le spoil devient un vrai sujet, la policy devra
-- être restreinte aux beats présents dans `user_narrative_unlocks` — le mobile
-- passant déjà par l'API pour lire le codex, ce resserrage ne casserait rien.
create policy "narrative_beats_select_public"
  on public.narrative_beats for select
  to anon, authenticated
  using (true);

-- Aucune policy d'écriture : un déblocage inséré par le client vaudrait
-- lecture de contenu non gagné, et fausserait `unlocked_at`.
create policy "user_narrative_unlocks_select_own"
  on public.user_narrative_unlocks for select
  to authenticated
  using ((select auth.uid()) = profile_id);

-- ---------------------------------------------------------------------------
-- Séances par sport
-- ---------------------------------------------------------------------------

-- PostgREST ne sait pas exprimer un GROUP BY. Les deux contournements possibles
-- coûtaient plus cher que cette fonction : rapatrier toutes les séances du
-- profil pour les compter en TypeScript fait grossir la requête avec
-- l'ancienneté du compte, et une requête `count` par sport multiplie les
-- allers-retours réseau à chaque séance enregistrée.
--
-- Aucune règle de jeu ici non plus : la fonction compte, elle ne décide pas.
-- Les seuils restent dans le code de l'API.
create or replace function public.count_workouts_by_sport(p_profile_id uuid)
returns table (sport_id text, sessions int)
language sql
stable
set search_path = ''
as $$
  select w.sport_id, count(*)::int as sessions
  from public.workout_logs w
  where w.profile_id = p_profile_id
  group by w.sport_id;
$$;

-- `security invoker` par défaut : appelée par un client mobile, la RLS de
-- `workout_logs` s'appliquerait et il ne compterait que ses propres séances —
-- il n'y a donc pas de fuite à colmater ici. La révocation limite quand même la
-- surface d'appel à ce qui en a besoin, et surtout elle évite qu'un futur
-- passage en `security definer` rouvre l'accès sans que personne le remarque.
revoke all on function public.count_workouts_by_sport(uuid)
  from public, anon, authenticated;

grant execute on function public.count_workouts_by_sport(uuid) to service_role;

comment on function public.count_workouts_by_sport is
  'Nombre de séances par sport pour un profil. Source des triggers de trames annexes.';
