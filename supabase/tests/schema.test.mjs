/**
 * Tests du schéma et de la RLS, exécutés contre un Postgres 17 embarqué
 * (PGlite, WASM) — pas besoin de Docker ni d'un projet Supabase distant.
 *
 *   pnpm db:test
 *
 * Ce que ces tests protègent : le modèle anti-triche. Une policy trop
 * permissive ne se voit pas à la relecture, mais se voit ici.
 *
 * Limite assumée : PGlite est un Postgres nu. Les objets fournis par la
 * plateforme Supabase (schéma `auth`, rôles, `auth.uid()`) sont simulés
 * ci-dessous. Les tests valident donc le SQL des migrations et la logique des
 * policies, pas le comportement de GoTrue ou de PostgREST.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Objets fournis par la plateforme Supabase, absents d'un Postgres nu. */
const SUPABASE_STUBS = `
  create schema if not exists auth;

  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text
  );

  create role anon;
  create role authenticated;
  create role service_role;

  -- En vrai, auth.uid() lit le « sub » du JWT. On le simule par un paramètre
  -- de session, ce qui permet d'endosser l'identité d'un utilisateur donné.
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
`;

/** Droits que Supabase accorde par défaut ; la RLS reste le seul garde-fou. */
const SUPABASE_GRANTS = `
  grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public
    to anon, authenticated;
`;

let db;

/** Exécute une requête en endossant l'identité d'un utilisateur mobile. */
async function asUser(profileId, sql) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub', '${profileId}', false);`,
  );
  try {
    return await db.query(sql);
  } finally {
    await db.exec('reset role;');
  }
}

/** Vérifie qu'une requête est bien rejetée, et renvoie le message d'erreur. */
async function rejects(fn) {
  try {
    await fn();
  } catch (error) {
    return error.message;
  }
  assert.fail('la requête a réussi alors qu’elle devait être rejetée');
}

async function createUser(email) {
  const { rows } = await db.query(`insert into auth.users (email) values ($1) returning id`, [
    email,
  ]);
  return rows[0].id;
}

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);

  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }

  await db.exec(SUPABASE_GRANTS);
  await db.exec(`insert into public.sports (id, name) values ('test', 'Test');`);
});

after(async () => {
  await db?.close();
});

describe('courbe de niveaux', () => {
  test('50 paliers seedés, démarrant à 0 XP', async () => {
    const { rows } = await db.query(
      `select count(*)::int as total, min(xp_required) as floor from public.level_thresholds`,
    );
    assert.equal(rows[0].total, 50);
    assert.equal(rows[0].floor, 0);
  });

  test('strictement croissante', async () => {
    const { rows } = await db.query(`
      select bool_and(croissant) as ok from (
        select xp_required > lag(xp_required) over (order by level) as croissant
        from public.level_thresholds
      ) t where croissant is not null
    `);
    assert.equal(rows[0].ok, true);
  });
});

describe('création de compte', () => {
  test('un signup crée profil, progression et entitlement freemium', async () => {
    const userId = await createUser('signup@grindrise.test');

    const { rows } = await db.query(
      `select
         (select count(*) from public.profiles where id = $1)::int as profils,
         (select count(*) from public.user_progress where profile_id = $1)::int as progressions,
         (select plan::text from public.entitlements where profile_id = $1) as plan,
         (select status::text from public.entitlements where profile_id = $1) as statut`,
      [userId],
    );

    assert.deepEqual(rows[0], { profils: 1, progressions: 1, plan: 'freemium', statut: 'active' });
  });
});

describe('fuseau horaire du profil', () => {
  test('un nouveau profil part sur le fuseau par défaut', async () => {
    const userId = await createUser('fuseau@grindrise.test');
    const { rows } = await db.query(`select timezone from public.profiles where id = $1`, [
      userId,
    ]);
    assert.equal(rows[0].timezone, 'Europe/Paris');
  });

  test('un fuseau inconnu est rejeté par la base', async () => {
    // La colonne est écrite par le client (policy profiles_update_own) et
    // pilote le découpage en jours : une valeur farfelue ne doit pas attendre
    // le calcul serveur pour être découverte.
    const userId = await createUser('mauvais-fuseau@grindrise.test');
    const message = await rejects(() =>
      db.query(`update public.profiles set timezone = 'Mars/Olympus' where id = $1`, [userId]),
    );
    assert.match(message, /Mars\/Olympus|time zone/i);
  });

  test('un fuseau IANA valide est accepté', async () => {
    const userId = await createUser('bon-fuseau@grindrise.test');
    await db.query(`update public.profiles set timezone = 'Pacific/Auckland' where id = $1`, [
      userId,
    ]);
    const { rows } = await db.query(`select timezone from public.profiles where id = $1`, [
      userId,
    ]);
    assert.equal(rows[0].timezone, 'Pacific/Auckland');
  });

  test('la progression démarre sans dernier jour de séance', async () => {
    const userId = await createUser('sans-seance@grindrise.test');
    const { rows } = await db.query(
      `select streak_days, last_workout_on from public.user_progress where profile_id = $1`,
      [userId],
    );
    assert.deepEqual(rows[0], { streak_days: 0, last_workout_on: null });
  });
});

describe('xp_events est append-only', () => {
  let userId;
  let workoutId;
  let xpEventId;

  before(async () => {
    userId = await createUser('xp@grindrise.test');
    workoutId = (
      await db.query(
        `insert into public.workout_logs (profile_id, sport_id) values ($1, 'test') returning id`,
        [userId],
      )
    ).rows[0].id;
    xpEventId = (
      await db.query(
        `insert into public.xp_events (profile_id, source_type, source_id, amount)
         values ($1, 'workout', $2, 50) returning id`,
        [userId, workoutId],
      )
    ).rows[0].id;
  });

  test('une mise à jour est rejetée, même en service_role', async () => {
    const message = await rejects(() =>
      db.query(`update public.xp_events set amount = 99999 where id = $1`, [xpEventId]),
    );
    assert.match(message, /append-only/);
  });

  test('une suppression directe est rejetée', async () => {
    const message = await rejects(() =>
      db.query(`delete from public.xp_events where id = $1`, [xpEventId]),
    );
    assert.match(message, /append-only/);
  });

  test('créditer deux fois la même séance est impossible', async () => {
    const message = await rejects(() =>
      db.query(
        `insert into public.xp_events (profile_id, source_type, source_id, amount)
         values ($1, 'workout', $2, 50)`,
        [userId, workoutId],
      ),
    );
    assert.match(message, /xp_events_source_unique_idx/);
  });

  test('la suppression du compte purge quand même tout (RGPD)', async () => {
    await db.query(`delete from auth.users where id = $1`, [userId]);

    const { rows } = await db.query(
      `select (select count(*) from public.xp_events where profile_id = $1)::int as xp,
              (select count(*) from public.profiles where id = $1)::int as profils`,
      [userId],
    );
    assert.deepEqual(rows[0], { xp: 0, profils: 0 });
  });
});

describe('workout_logs', () => {
  test('une séance dans le futur est rejetée', async () => {
    const userId = await createUser('futur@grindrise.test');
    const message = await rejects(() =>
      db.query(
        `insert into public.workout_logs (profile_id, sport_id, performed_at)
         values ($1, 'test', now() + interval '2 days')`,
        [userId],
      ),
    );
    assert.match(message, /workout_logs_not_in_future/);
  });
});

describe('RLS vue depuis un client mobile', () => {
  let moi;
  let autrui;

  before(async () => {
    moi = await createUser('moi@grindrise.test');
    autrui = await createUser('autrui@grindrise.test');
    await db.query(
      `insert into public.xp_events (profile_id, source_type, amount) values ($1, 'manual_adjustment', 10)`,
      [autrui],
    );
  });

  test('les tables de référence sont lisibles', async () => {
    const { rows } = await asUser(moi, `select id from public.sports`);
    assert.ok(rows.length > 0);
  });

  test('seul son propre profil est visible', async () => {
    const { rows } = await asUser(moi, `select id from public.profiles`);
    assert.deepEqual(rows, [{ id: moi }]);
  });

  test('l’XP d’autrui est invisible', async () => {
    const { rows } = await asUser(moi, `select id from public.xp_events`);
    assert.equal(rows.length, 0);
  });

  test('insérer de l’XP est rejeté — cœur du modèle anti-triche', async () => {
    const message = await rejects(() =>
      asUser(
        moi,
        `insert into public.xp_events (profile_id, source_type, amount)
         values ('${moi}', 'manual_adjustment', 999999)`,
      ),
    );
    assert.match(message, /row-level security/);
  });

  test('logger une séance au nom d’autrui est rejeté', async () => {
    const message = await rejects(() =>
      asUser(moi, `insert into public.workout_logs (profile_id, sport_id) values ('${autrui}', 'test')`),
    );
    assert.match(message, /row-level security/);
  });

  test('logger sa propre séance en direct est rejeté — l’API est le seul chemin', async () => {
    // Une séance insérée hors de l'API n'aurait jamais d'XP, mais compterait
    // quand même pour le streak : de quoi se fabriquer 365 jours de chaîne et
    // encaisser tous les paliers d'un coup.
    const message = await rejects(() =>
      asUser(moi, `insert into public.workout_logs (profile_id, sport_id) values ('${moi}', 'test')`),
    );
    assert.match(message, /row-level security/);
  });

  test('appeler la RPC d’octroi d’XP est refusé', async () => {
    // Postgres accorde EXECUTE à PUBLIC par défaut : sans révocation explicite,
    // ce seul appel suffirait à s'attribuer 999 999 XP.
    const message = await rejects(() =>
      asUser(
        moi,
        `select public.log_workout_with_xp(
           '${moi}'::uuid, 'test', now(), '{}'::jsonb,
           999999, 0, 1, current_date,
           now() - interval '1 hour', now() + interval '1 hour', 2, 30
         )`,
      ),
    );
    assert.match(message, /permission denied/i);
  });

  test('gonfler sa progression ne touche aucune ligne', async () => {
    // Pas d'erreur ici : sans policy UPDATE, la RLS filtre les lignes en amont
    // et la requête réussit à vide. L'API ne doit donc jamais interpréter
    // « pas d'erreur » comme « écriture effectuée ».
    const res = await asUser(
      moi,
      `update public.user_progress set level = 99, current_xp = 999999 where profile_id = '${moi}'`,
    );
    assert.equal(res.affectedRows, 0);

    const { rows } = await db.query(
      `select level, current_xp from public.user_progress where profile_id = $1`,
      [moi],
    );
    assert.deepEqual(rows[0], { level: 1, current_xp: 0 });
  });

  test('s’offrir un plan lifetime ne touche aucune ligne', async () => {
    const res = await asUser(
      moi,
      `update public.entitlements set plan = 'lifetime' where profile_id = '${moi}'`,
    );
    assert.equal(res.affectedRows, 0);

    const { rows } = await db.query(
      `select plan::text as plan from public.entitlements where profile_id = $1`,
      [moi],
    );
    assert.equal(rows[0].plan, 'freemium');
  });
});

describe('log_workout_with_xp', () => {
  /**
   * Appelle la RPC comme le ferait l'API.
   *
   * La fenêtre de jour est volontairement large (± 1 jour) : elle est un
   * paramètre de la fonction, pas une règle qu'elle applique, et cela rend le
   * test indépendant de l'heure à laquelle il tourne.
   */
  async function logWorkout(profileId, options = {}) {
    const {
      performedAt = 'now()',
      workoutXp = 100,
      streakXp = 0,
      streakDays = 1,
      dailyLimit = 2,
      minGapMinutes = 30,
    } = options;

    const { rows } = await db.query(
      `select public.log_workout_with_xp(
         $1::uuid, 'test', ${performedAt}, '{"reps": 10}'::jsonb,
         $2, $3, $4, current_date,
         now() - interval '1 day', now() + interval '1 day',
         $5, $6
       ) as result`,
      [profileId, workoutXp, streakXp, streakDays, dailyLimit, minGapMinutes],
    );

    return rows[0].result;
  }

  test('crédite la séance et fait monter le niveau', async () => {
    const userId = await createUser('rpc-nominal@grindrise.test');
    const result = await logWorkout(userId);

    assert.equal(result.xp_awarded, 100);
    assert.equal(result.capped_reason, null);
    assert.equal(result.progress.current_xp, 100);
    // Le premier palier de la courbe seedée est à 100 XP cumulés.
    assert.equal(result.progress.level, 2);
    assert.equal(result.progress.streak_days, 1);
    assert.ok(result.progress.last_workout_on);
    assert.equal(result.workout.sport_id, 'test');
  });

  test('le bonus de streak est un événement distinct de la séance', async () => {
    const userId = await createUser('rpc-streak@grindrise.test');
    const result = await logWorkout(userId, { workoutXp: 60, streakXp: 25 });

    assert.equal(result.xp_awarded, 85);

    const { rows } = await db.query(
      `select source_type::text as type, amount from public.xp_events
       where profile_id = $1 order by source_type::text`,
      [userId],
    );
    assert.deepEqual(rows, [
      { type: 'streak', amount: 25 },
      { type: 'workout', amount: 60 },
    ]);
  });

  test('au-delà du plafond journalier, la séance est enregistrée sans XP', async () => {
    const userId = await createUser('rpc-plafond@grindrise.test');
    await logWorkout(userId, { performedAt: "now() - interval '6 hours'" });
    await logWorkout(userId, { performedAt: "now() - interval '3 hours'" });

    const troisieme = await logWorkout(userId, { performedAt: "now() - interval '1 hour'" });

    assert.equal(troisieme.capped_reason, 'daily_limit');
    assert.equal(troisieme.xp_awarded, 0);
    assert.equal(troisieme.progress.current_xp, 200);

    // La séance existe quand même : l'app reste un tracker, seule l'XP est
    // plafonnée.
    const { rows } = await db.query(
      `select count(*)::int as total from public.workout_logs where profile_id = $1`,
      [userId],
    );
    assert.equal(rows[0].total, 3);
  });

  test('deux séances trop rapprochées : la seconde n’est pas créditée', async () => {
    const userId = await createUser('rpc-rapproche@grindrise.test');
    await logWorkout(userId, { performedAt: "now() - interval '2 hours'" });

    const seconde = await logWorkout(userId, {
      performedAt: "now() - interval '110 minutes'",
    });

    assert.equal(seconde.capped_reason, 'too_close');
    assert.equal(seconde.xp_awarded, 0);
    assert.equal(seconde.progress.current_xp, 100);
  });

  test('le cache converge vers la somme des événements', async () => {
    const userId = await createUser('rpc-convergence@grindrise.test');
    await logWorkout(userId, { performedAt: "now() - interval '5 hours'" });
    await logWorkout(userId, { performedAt: "now() - interval '1 hour'", streakXp: 10 });

    const { rows } = await db.query(
      `select p.current_xp,
              (select coalesce(sum(amount), 0)::int from public.xp_events where profile_id = $1) as somme,
              (select max(level) from public.level_thresholds t where t.xp_required <= p.current_xp) as palier
       from public.user_progress p where p.profile_id = $1`,
      [userId],
    );

    assert.equal(rows[0].current_xp, rows[0].somme);
    assert.equal(rows[0].current_xp, 210);
    assert.equal(rows[0].palier, 2);
  });
});
