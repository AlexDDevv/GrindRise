-- L'API devient le seul chemin qui enregistre une séance, et elle le fait en
-- une transaction.
--
-- Deux problèmes réglés ensemble parce qu'ils n'ont de sens qu'ensemble.
--
-- 1. Deux chemins d'écriture, deux vérités. Tant que le mobile pouvait insérer
--    directement dans `workout_logs`, une séance pouvait exister sans XP. Ce
--    n'est pas qu'une incohérence d'affichage : le streak se dérive de
--    `workout_logs`, donc un client pouvait s'y fabriquer 365 jours de séances
--    sans jamais toucher `xp_events`, puis logger une vraie séance par l'API et
--    encaisser tous les paliers de streak d'un coup. Les policies d'écriture
--    disparaissent donc ; la lecture reste.
--
--    UPDATE et DELETE tombent pour la même raison : `xp_events` est
--    append-only, donc supprimer une séance laisserait son XP en place et
--    rendrait le streak recalculé incohérent avec l'XP déjà versée. Éditer ou
--    supprimer une séance mérite un endpoint qui retire aussi son XP par un
--    événement compensatoire — c'est un sujet en soi, pas une policy ouverte.
--
-- 2. Trois écritures, une seule transaction. PostgREST ne sait pas enchaîner
--    `workout_logs`, `xp_events` et `user_progress` dans une transaction : une
--    interruption entre la première et la deuxième laisserait une séance sans
--    XP. Et `recomputeProgress` ne rattrape pas ce cas — il recalcule le cache
--    à partir de `xp_events`, il ne crée pas l'événement manquant. D'où cette
--    fonction, appelée en RPC.
--
-- Le game design reste hors de la base : la fonction reçoit des montants déjà
-- calculés, et les plafonds sous forme de nombres (`p_daily_credited_limit`,
-- `p_min_gap_minutes`), jamais de règles. Ce qu'elle apporte, c'est
-- l'atomicité et la sérialisation — pas le barème.

-- ---------------------------------------------------------------------------
-- Le client ne peut plus écrire de séance
-- ---------------------------------------------------------------------------

drop policy "workout_logs_insert_own" on public.workout_logs;
drop policy "workout_logs_update_own" on public.workout_logs;
drop policy "workout_logs_delete_own" on public.workout_logs;

comment on table public.workout_logs is
  'Séances. Lecture par le propriétaire, écriture par l''API seule (RPC log_workout_with_xp) : une séance sans xp_events fausserait le streak.';

-- ---------------------------------------------------------------------------
-- Enregistrement atomique d'une séance et de son XP
-- ---------------------------------------------------------------------------

create or replace function public.log_workout_with_xp(
  p_profile_id uuid,
  p_sport_id text,
  p_performed_at timestamptz,
  p_metrics jsonb,
  -- Montants calculés par l'API. 0 = ne rien créditer (`xp_events.amount`
  -- interdit d'ailleurs la valeur 0).
  p_workout_xp int,
  p_streak_xp int,
  -- État du streak recalculé par l'API depuis l'historique complet.
  p_streak_days int,
  p_last_workout_on date,
  -- Bornes du jour LOCAL de la séance, déjà converties en instants absolus.
  p_day_start timestamptz,
  p_day_end timestamptz,
  -- Plafonds, en valeurs : la règle vit dans le code, pas ici.
  p_daily_credited_limit int,
  p_min_gap_minutes int
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_workout public.workout_logs;
  v_progress public.user_progress;
  v_credited int;
  v_too_close boolean;
  v_inserted int;
  v_awarded int := 0;
  v_reason text := null;
begin
  -- Sérialise les enregistrements d'un même profil. Sans ce verrou, deux
  -- requêtes simultanées liraient chacune « une seule séance créditée
  -- aujourd'hui » et franchiraient le plafond ensemble. Il est transactionnel :
  -- relâché au commit, sans rien à libérer à la main.
  perform pg_advisory_xact_lock(
    hashtext('grindrise:log_workout'),
    hashtext(p_profile_id::text)
  );

  -- La séance est enregistrée quoi qu'il arrive : l'app est aussi un tracker,
  -- refuser l'enregistrement punirait un usage légitime. Seule l'XP est
  -- plafonnée.
  insert into public.workout_logs (profile_id, sport_id, performed_at, metrics)
  values (p_profile_id, p_sport_id, p_performed_at, coalesce(p_metrics, '{}'::jsonb))
  returning * into v_workout;

  -- Une séance « créditée » est une séance qui porte un xp_events : c'est le
  -- seul critère qui résiste à un plafonnement antérieur.
  select count(*) into v_credited
  from public.workout_logs w
  join public.xp_events e
    on e.profile_id = w.profile_id
   and e.source_type = 'workout'
   and e.source_id = w.id
  where w.profile_id = p_profile_id
    and w.performed_at >= p_day_start
    and w.performed_at < p_day_end;

  select exists (
    select 1
    from public.workout_logs w
    join public.xp_events e
      on e.profile_id = w.profile_id
     and e.source_type = 'workout'
     and e.source_id = w.id
    where w.profile_id = p_profile_id
      and w.id <> v_workout.id
      and w.performed_at > p_performed_at - make_interval(mins => p_min_gap_minutes)
      and w.performed_at < p_performed_at + make_interval(mins => p_min_gap_minutes)
  ) into v_too_close;

  if v_credited >= p_daily_credited_limit then
    v_reason := 'daily_limit';
  elsif v_too_close then
    v_reason := 'too_close';
  else
    if p_workout_xp > 0 then
      -- `on conflict do nothing` : un conflit sur l'index d'idempotence
      -- signifie « déjà crédité », pas « erreur ». Le montant n'est alors pas
      -- compté deux fois puisque seul un insert effectif renvoie une ligne.
      insert into public.xp_events (profile_id, source_type, source_id, amount)
      values (p_profile_id, 'workout', v_workout.id, p_workout_xp)
      on conflict do nothing
      returning amount into v_inserted;

      v_awarded := v_awarded + coalesce(v_inserted, 0);
      v_inserted := null;
    end if;

    -- Le bonus de palier est un événement distinct plutôt qu'un multiplicateur
    -- fondu dans le montant de la séance : le joueur voit d'où vient son XP, et
    -- rééquilibrer l'un n'oblige pas à recalculer l'autre. Même `source_id`,
    -- `source_type` différent : l'index d'idempotence les distingue.
    if p_streak_xp > 0 then
      insert into public.xp_events (profile_id, source_type, source_id, amount)
      values (p_profile_id, 'streak', v_workout.id, p_streak_xp)
      on conflict do nothing
      returning amount into v_inserted;

      v_awarded := v_awarded + coalesce(v_inserted, 0);
    end if;
  end if;

  -- Somme complète plutôt qu'incrément : le cache converge alors exactement
  -- vers ce que `recomputeProgress` produirait, donc les deux chemins ne
  -- peuvent pas diverger.
  update public.user_progress up
  set current_xp = totals.xp,
      level = coalesce(
        (select max(t.level)
         from public.level_thresholds t
         where t.xp_required <= totals.xp),
        1
      ),
      streak_days = p_streak_days,
      last_workout_on = p_last_workout_on,
      updated_at = now()
  from (
    select coalesce(sum(e.amount), 0)::int as xp
    from public.xp_events e
    where e.profile_id = p_profile_id
  ) totals
  where up.profile_id = p_profile_id
  returning up.* into v_progress;

  if not found then
    -- Le trigger sur auth.users garantit la ligne : son absence est un
    -- incident, pas un cas nominal à traiter silencieusement.
    raise exception 'aucune progression pour le profil % ', p_profile_id
      using errcode = 'no_data_found';
  end if;

  return jsonb_build_object(
    'workout', to_jsonb(v_workout),
    'progress', to_jsonb(v_progress),
    'xp_awarded', v_awarded,
    'capped_reason', v_reason
  );
end;
$$;

-- Postgres accorde EXECUTE à PUBLIC par défaut sur toute fonction. Sans cette
-- révocation, le mobile appellerait la RPC avec `p_workout_xp = 999999` et tout
-- le modèle anti-triche tomberait — c'est le trou le plus dangereux de cette
-- migration, et il est silencieux.
revoke all on function public.log_workout_with_xp(
  uuid, text, timestamptz, jsonb, int, int, int, date, timestamptz, timestamptz, int, int
) from public, anon, authenticated;

grant execute on function public.log_workout_with_xp(
  uuid, text, timestamptz, jsonb, int, int, int, date, timestamptz, timestamptz, int, int
) to service_role;

comment on function public.log_workout_with_xp is
  'Enregistre une séance et crédite son XP en une transaction. Les montants et les plafonds sont fournis par l''API : cette fonction n''applique aucune règle de game design.';
