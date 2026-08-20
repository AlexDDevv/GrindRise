-- `log_workout_with_xp` apprend à écrire une séance structurée.
--
-- Pourquoi étendre la fonction existante plutôt qu'en écrire une seconde : ce
-- serait dupliquer le verrou consultatif, le plafond journalier, la règle des
-- 30 minutes et le recalcul de la progression. Deux copies de ce bloc finiraient
-- par diverger, et c'est exactement le modèle anti-triche qui divergerait.
--
-- ⚠️ Ajouter un paramètre à une fonction Postgres crée une SURCHARGE, pas un
-- remplacement. Sans le `drop` explicite ci-dessous, les deux signatures
-- coexisteraient et PostgREST résoudrait l'appel selon les arguments nommés
-- reçus — donc parfois vers l'ancienne, qui ignore les exercices. Le bug serait
-- silencieux et intermittent.
--
-- Extension de la convention de codes déclarée par `reject_unknown_sport` :
--
--   GR001  paramètre inconnu d'une table de référence      → 400
--   GR002  exercice inconnu ou inaccessible                 → 400
--   GR003  ressource appartenant à un autre profil          → 404
--
-- GR003 devient un 404 et non un 403 : répondre « interdit » confirmerait que
-- l'identifiant existe.

drop function public.log_workout_with_xp(
  uuid, text, timestamptz, jsonb, int, int, int, date, timestamptz, timestamptz, int, int
);

create or replace function public.log_workout_with_xp(
  p_profile_id uuid,
  p_sport_id text,
  p_performed_at timestamptz,
  p_metrics jsonb,
  -- Séance structurée, null pour les sports à log plat. Forme attendue :
  --   [{"exercise_id": "...", "sets": [
  --      {"type":"reps","reps":10,"weight_kg":80,"is_bodyweight":false},
  --      {"type":"time","duration_seconds":45,"is_bodyweight":true}
  --   ]}]
  -- `order_index` et `set_index` ne sont PAS dans le payload : ils sont dérivés
  -- de la position dans le tableau, donc l'ordre stocké ne peut pas diverger de
  -- l'ordre envoyé.
  p_exercises jsonb,
  -- Jour type suivi, ou null pour une séance libre.
  p_program_workout_id uuid,
  -- Montants calculés par l'API. 0 = ne rien créditer.
  p_workout_xp int,
  p_streak_xp int,
  p_streak_days int,
  p_last_workout_on date,
  p_day_start timestamptz,
  p_day_end timestamptz,
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
  v_exercises jsonb := '[]'::jsonb;
  v_credited int;
  v_too_close boolean;
  v_inserted int;
  v_awarded int := 0;
  v_reason text := null;
begin
  if not exists (select 1 from public.sports where id = p_sport_id) then
    raise exception 'sport inconnu : %', p_sport_id using errcode = 'GR001';
  end if;

  -- Les contrôles de référence passent AVANT le verrou : inutile de sérialiser
  -- un profil pour rejeter une requête malformée.

  -- Sans ce contrôle, on peut loguer l'exercice custom d'un autre utilisateur,
  -- et donc en déduire l'existence.
  if p_exercises is not null and exists (
    select 1
    from jsonb_array_elements(p_exercises) as e
    left join public.exercises x
      on x.id = (e.value ->> 'exercise_id')::uuid
     and (x.created_by is null or x.created_by = p_profile_id)
    where x.id is null
  ) then
    raise exception 'exercice inconnu ou inaccessible'
      using errcode = 'GR002';
  end if;

  if p_program_workout_id is not null and not exists (
    select 1
    from public.program_workouts pw
    join public.programs p on p.id = pw.program_id
    where pw.id = p_program_workout_id and p.profile_id = p_profile_id
  ) then
    raise exception 'jour de programme inaccessible'
      using errcode = 'GR003';
  end if;

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
  insert into public.workout_logs (
    profile_id, sport_id, performed_at, metrics, program_workout_id
  )
  values (
    p_profile_id, p_sport_id, p_performed_at,
    coalesce(p_metrics, '{}'::jsonb), p_program_workout_id
  )
  returning * into v_workout;

  if p_exercises is not null then
    insert into public.logged_exercises (workout_log_id, exercise_id, order_index)
    select v_workout.id,
           (e.value ->> 'exercise_id')::uuid,
           (e.ordinality - 1)::int
    from jsonb_array_elements(p_exercises) with ordinality as e(value, ordinality);

    insert into public.logged_sets (
      logged_exercise_id, set_index, type, reps, duration_seconds,
      weight_kg, is_bodyweight
    )
    select le.id,
           (s.ordinality - 1)::int,
           (s.value ->> 'type')::public.set_type,
           nullif(s.value ->> 'reps', '')::int,
           nullif(s.value ->> 'duration_seconds', '')::int,
           nullif(s.value ->> 'weight_kg', '')::numeric,
           coalesce((s.value ->> 'is_bodyweight')::boolean, false)
    from jsonb_array_elements(p_exercises) with ordinality as e(value, ordinality)
    join public.logged_exercises le
      on le.workout_log_id = v_workout.id
     and le.order_index = (e.ordinality - 1)::int
    cross join lateral
      jsonb_array_elements(e.value -> 'sets') with ordinality as s(value, ordinality);
  end if;

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

  -- Relu depuis la base plutôt que renvoyé depuis le payload : ce que l'API
  -- rapportera au client est alors ce qui est réellement stocké, rangs compris.
  select coalesce(jsonb_agg(x.obj order by x.order_index), '[]'::jsonb)
  into v_exercises
  from (
    select le.order_index,
           jsonb_build_object(
             'exercise_id', le.exercise_id,
             'sets', coalesce((
               select jsonb_agg(
                        jsonb_build_object(
                          'type', ls.type,
                          'reps', ls.reps,
                          'duration_seconds', ls.duration_seconds,
                          'weight_kg', ls.weight_kg,
                          'is_bodyweight', ls.is_bodyweight
                        ) order by ls.set_index
                      )
               from public.logged_sets ls
               where ls.logged_exercise_id = le.id
             ), '[]'::jsonb)
           ) as obj
    from public.logged_exercises le
    where le.workout_log_id = v_workout.id
  ) x;

  return jsonb_build_object(
    'workout', to_jsonb(v_workout),
    'progress', to_jsonb(v_progress),
    'xp_awarded', v_awarded,
    'capped_reason', v_reason,
    'exercises', v_exercises
  );
end;
$$;

-- Postgres accorde EXECUTE à PUBLIC par défaut sur toute fonction. Sans cette
-- révocation, le mobile appellerait la RPC avec `p_workout_xp = 999999` et tout
-- le modèle anti-triche tomberait — c'est le trou le plus dangereux de cette
-- migration, et il est silencieux.
revoke all on function public.log_workout_with_xp(
  uuid, text, timestamptz, jsonb, jsonb, uuid, int, int, int, date,
  timestamptz, timestamptz, int, int
) from public, anon, authenticated;

grant execute on function public.log_workout_with_xp(
  uuid, text, timestamptz, jsonb, jsonb, uuid, int, int, int, date,
  timestamptz, timestamptz, int, int
) to service_role;

comment on function public.log_workout_with_xp is
  'Enregistre une séance, ses exercices et ses séries, et crédite son XP en une transaction. Les montants et les plafonds sont fournis par l''API : cette fonction n''applique aucune règle de game design.';

-- ---------------------------------------------------------------------------
-- Liste ordonnée d'exercices d'un jour type
-- ---------------------------------------------------------------------------

-- Un remplacement complet plutôt qu'un trio ajouter/retirer/réordonner :
-- réordonner devient l'envoi d'un tableau, et il n'existe aucun état
-- intermédiaire où deux exercices partagent un rang. Ce qui suppose delete puis
-- insert dans une même transaction — que PostgREST ne sait pas enchaîner, d'où
-- cette fonction.
--
-- Elle vérifie l'appartenance elle-même : l'API l'appelle avec la clé
-- service_role, qui contourne la RLS.
create or replace function public.replace_program_workout_exercises(
  p_profile_id uuid,
  p_program_workout_id uuid,
  p_exercise_ids uuid[]
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  if not exists (
    select 1
    from public.program_workouts pw
    join public.programs p on p.id = pw.program_id
    where pw.id = p_program_workout_id and p.profile_id = p_profile_id
  ) then
    raise exception 'jour de programme inaccessible'
      using errcode = 'GR003';
  end if;

  if exists (
    select 1
    from unnest(p_exercise_ids) as wanted(id)
    left join public.exercises x
      on x.id = wanted.id
     and (x.created_by is null or x.created_by = p_profile_id)
    where x.id is null
  ) then
    raise exception 'exercice inconnu ou inaccessible'
      using errcode = 'GR002';
  end if;

  delete from public.program_workout_exercises
  where program_workout_id = p_program_workout_id;

  -- Un même exercice peut apparaître deux fois dans un jour type : rien ne
  -- l'interdit, et c'est un usage réel (revenir sur un mouvement en fin de
  -- séance). Seul le rang est unique.
  insert into public.program_workout_exercises (
    program_workout_id, exercise_id, order_index
  )
  select p_program_workout_id, e.id, (e.ordinality - 1)::int
  from unnest(p_exercise_ids) with ordinality as e(id, ordinality);

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', pwe.id,
               'exercise_id', pwe.exercise_id,
               'order_index', pwe.order_index
             ) order by pwe.order_index
           ),
           '[]'::jsonb
         )
  into v_rows
  from public.program_workout_exercises pwe
  where pwe.program_workout_id = p_program_workout_id;

  return v_rows;
end;
$$;

revoke all on function public.replace_program_workout_exercises(uuid, uuid, uuid[])
  from public, anon, authenticated;

grant execute on function public.replace_program_workout_exercises(uuid, uuid, uuid[])
  to service_role;
