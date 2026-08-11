-- Un sport inexistant est une faute du client, pas une panne du serveur.
--
-- Jusqu'ici, `log_workout_with_xp` laissait la clé étrangère
-- `workout_logs_sport_id_fkey` faire le refus. Ça marche — rien n'est écrit —
-- mais l'API ne peut pas distinguer cette violation d'une panne réelle, donc
-- elle répond 500 à ce qui est un simple 400. Un client n'a aucun moyen de
-- comprendre que c'est sa requête qui est fautive.
--
-- Trois façons de corriger, et pourquoi celle-ci :
--
-- - lire `sports` avant d'appeler la RPC ajouterait un aller-retour réseau à
--   chaque séance enregistrée, pour valider une table de quatre lignes ;
-- - reconnaître la violation de clé étrangère côté API supposerait de lire le
--   nom de la contrainte dans un message d'erreur, donc de dépendre d'un texte
--   que Postgres ne garantit pas ;
-- - déclarer explicitement l'erreur, ce que fait cette migration : la fonction
--   annonce elle-même « ce paramètre est invalide », avec un code que l'API
--   traduit sans rien deviner.
--
-- Convention de codes : `GR0xx` est réservé aux erreurs métier levées par nos
-- fonctions, à traduire en 400 côté API. Postgres autorise ces SQLSTATE
-- définis par l'utilisateur, et aucune erreur système ne les emprunte.
--
--   GR001  paramètre inconnu d'une table de référence
--
-- Le contrôle coûte un `exists` sur une clé primaire dans une transaction déjà
-- ouverte, et il est placé avant le verrou : inutile de sérialiser un profil
-- pour rejeter une requête malformée.

create or replace function public.log_workout_with_xp(
  p_profile_id uuid,
  p_sport_id text,
  p_performed_at timestamptz,
  p_metrics jsonb,
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
  v_credited int;
  v_too_close boolean;
  v_inserted int;
  v_awarded int := 0;
  v_reason text := null;
begin
  if not exists (select 1 from public.sports where id = p_sport_id) then
    raise exception 'sport inconnu : %', p_sport_id using errcode = 'GR001';
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

-- `create or replace` conserve les droits existants, mais les redonner
-- explicitement rend cette migration lisible seule : quiconque l'ouvre voit qui
-- peut appeler cette fonction sans avoir à remonter la précédente.
revoke all on function public.log_workout_with_xp(
  uuid, text, timestamptz, jsonb, int, int, int, date, timestamptz, timestamptz, int, int
) from public, anon, authenticated;

grant execute on function public.log_workout_with_xp(
  uuid, text, timestamptz, jsonb, int, int, int, date, timestamptz, timestamptz, int, int
) to service_role;
