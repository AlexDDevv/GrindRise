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

/** Exécute une requête en visiteur non connecté (clé anon, aucune session). */
async function asAnon(sql) {
  await db.exec(
    `set role anon; select set_config('request.jwt.claim.sub', '', false);`,
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

describe('désabonnement des emails de palier', () => {
  let moi;
  let autrui;

  before(async () => {
    moi = await createUser('opt-out-moi@grindrise.test');
    autrui = await createUser('opt-out-autrui@grindrise.test');
  });

  test('un nouveau profil reçoit les emails de palier', async () => {
    const { rows } = await db.query(
      `select notify_level_up from public.profiles where id = $1`,
      [moi],
    );
    assert.equal(rows[0].notify_level_up, true);
  });

  test('le propriétaire peut se désabonner lui-même', async () => {
    // Le point de la migration : c'est une préférence d'utilisateur, pas une
    // donnée de jeu. Elle doit s'écrire depuis le mobile, sans passer par
    // l'API — donc par `profiles_update_own`, sans policy supplémentaire.
    const res = await asUser(
      moi,
      `update public.profiles set notify_level_up = false where id = '${moi}'`,
    );
    assert.equal(res.affectedRows, 1);

    const { rows } = await db.query(
      `select notify_level_up from public.profiles where id = $1`,
      [moi],
    );
    assert.equal(rows[0].notify_level_up, false);
  });

  test('désabonner autrui ne touche aucune ligne', async () => {
    const res = await asUser(
      moi,
      `update public.profiles set notify_level_up = false where id = '${autrui}'`,
    );
    assert.equal(res.affectedRows, 0);

    const { rows } = await db.query(
      `select notify_level_up from public.profiles where id = $1`,
      [autrui],
    );
    assert.equal(rows[0].notify_level_up, true);
  });

  test('un visiteur sans session ne voit ni ne modifie la préférence', async () => {
    const res = await asAnon(
      `update public.profiles set notify_level_up = false where id = '${autrui}'`,
    );
    assert.equal(res.affectedRows, 0);
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

describe('narrative_beats', () => {
  test('un beat de trame principale se déclenche au niveau global', async () => {
    await db.query(
      `insert into public.narrative_beats (track, order_index, trigger_type, trigger_value, title, body)
       values ('main', 901, 'global_level', 3, '', '')`,
    );

    const { rows } = await db.query(
      `select sport_id from public.narrative_beats where order_index = 901`,
    );
    // La trame principale n'appartient à aucun sport : la colonne générée doit
    // rester nulle, sinon la FK vers `sports` refuserait la ligne.
    assert.equal(rows[0].sport_id, null);
  });

  test('un beat annexe porte le sport extrait de son track', async () => {
    await db.query(
      `insert into public.narrative_beats (track, order_index, trigger_type, trigger_value, title, body)
       values ('sport:test', 902, 'sport_sessions_count', 5, '', '')`,
    );

    const { rows } = await db.query(
      `select sport_id from public.narrative_beats where order_index = 902`,
    );
    assert.equal(rows[0].sport_id, 'test');
  });

  test('un sport inexistant dans le track est rejeté', async () => {
    // Une faute de frappe dans un import de contenu produirait sinon un beat
    // que personne ne débloquera jamais, sans le moindre signal.
    const message = await rejects(() =>
      db.query(
        `insert into public.narrative_beats (track, order_index, trigger_type, trigger_value, title, body)
         values ('sport:quidditch', 903, 'sport_sessions_count', 5, '', '')`,
      ),
    );
    assert.match(message, /narrative_beats_sport_id_fkey/);
  });

  test('un track annexe déclenché par le niveau global est rejeté', async () => {
    // C'est l'erreur d'architecture que le schéma doit rendre impossible : une
    // trame annexe ouverte sans que le sport ait jamais été pratiqué.
    const message = await rejects(() =>
      db.query(
        `insert into public.narrative_beats (track, order_index, trigger_type, trigger_value, title, body)
         values ('sport:test', 904, 'global_level', 5, '', '')`,
      ),
    );
    assert.match(message, /narrative_beats_track_trigger_coherent/);
  });

  test('la trame principale ne peut pas se déclencher au nombre de séances', async () => {
    const message = await rejects(() =>
      db.query(
        `insert into public.narrative_beats (track, order_index, trigger_type, trigger_value, title, body)
         values ('main', 905, 'sport_sessions_count', 5, '', '')`,
      ),
    );
    assert.match(message, /narrative_beats_track_trigger_coherent/);
  });

  test('deux beats ne peuvent pas occuper le même rang dans une trame', async () => {
    const message = await rejects(() =>
      db.query(
        `insert into public.narrative_beats (track, order_index, trigger_type, trigger_value, title, body)
         values ('main', 901, 'global_level', 4, '', '')`,
      ),
    );
    assert.match(message, /narrative_beats_track_order_unique/);
  });
});

describe('user_narrative_unlocks', () => {
  let userId;
  let beatId;

  before(async () => {
    userId = await createUser('codex@grindrise.test');
    beatId = (
      await db.query(
        `insert into public.narrative_beats (track, order_index, trigger_type, trigger_value, title, body)
         values ('main', 910, 'global_level', 1, '', '') returning id`,
      )
    ).rows[0].id;
  });

  test('débloquer deux fois le même beat est impossible', async () => {
    // C'est cette contrainte qui rend la synchronisation rejouable : l'API peut
    // la relancer à chaque séance sans se demander ce qui existe déjà.
    await db.query(
      `insert into public.user_narrative_unlocks (profile_id, beat_id) values ($1, $2)`,
      [userId, beatId],
    );

    const message = await rejects(() =>
      db.query(
        `insert into public.user_narrative_unlocks (profile_id, beat_id) values ($1, $2)`,
        [userId, beatId],
      ),
    );
    assert.match(message, /user_narrative_unlocks_pkey/);
  });

  test('un déblocage part non lu', async () => {
    const { rows } = await db.query(
      `select read_at from public.user_narrative_unlocks where profile_id = $1`,
      [userId],
    );
    assert.equal(rows[0].read_at, null);
  });
});

describe('RLS narrative vue depuis un client mobile', () => {
  let moi;
  let autrui;
  let beatId;

  before(async () => {
    moi = await createUser('codex-moi@grindrise.test');
    autrui = await createUser('codex-autrui@grindrise.test');
    beatId = (
      await db.query(
        `insert into public.narrative_beats (track, order_index, trigger_type, trigger_value, title, body)
         values ('main', 920, 'global_level', 1, '', '') returning id`,
      )
    ).rows[0].id;
    await db.query(
      `insert into public.user_narrative_unlocks (profile_id, beat_id) values ($1, $2)`,
      [autrui, beatId],
    );
  });

  test('un beat non débloqué est invisible', async () => {
    // `moi` n'a aucun déblocage à ce stade : le contenu narratif ne doit pas
    // pouvoir être lu d'avance, sinon l'histoire est perdue avant d'être jouée.
    const { rows } = await asUser(moi, `select id from public.narrative_beats`);
    assert.equal(rows.length, 0);
  });

  test('un beat débloqué par autrui reste invisible', async () => {
    // Le déblocage est nominatif : celui d'un autre joueur n'ouvre rien.
    const { rows } = await asUser(
      moi,
      `select id from public.narrative_beats where id = '${beatId}'`,
    );
    assert.equal(rows.length, 0);
  });

  test('un beat débloqué est lisible par son propriétaire', async () => {
    const { rows } = await asUser(autrui, `select id from public.narrative_beats`);
    assert.deepEqual(rows, [{ id: beatId }]);
  });

  test('un visiteur sans session ne lit aucun beat', async () => {
    const { rows } = await asAnon(`select id from public.narrative_beats`);
    assert.equal(rows.length, 0);
  });

  test('les déblocages d’autrui sont invisibles', async () => {
    const { rows } = await asUser(moi, `select beat_id from public.user_narrative_unlocks`);
    assert.equal(rows.length, 0);
  });

  test('se débloquer un beat soi-même est rejeté', async () => {
    // Sans ça, le client s'ouvrirait tout le codex d'un insert, et `unlocked_at`
    // ne voudrait plus rien dire.
    const message = await rejects(() =>
      asUser(
        moi,
        `insert into public.user_narrative_unlocks (profile_id, beat_id)
         values ('${moi}', '${beatId}')`,
      ),
    );
    assert.match(message, /row-level security/);
  });

  test('se marquer un beat comme lu ne touche aucune ligne', async () => {
    // Le marquage passe par l'API : ici la RLS filtre en amont, donc l'UPDATE
    // réussit à vide plutôt que d'échouer.
    await db.query(
      `insert into public.user_narrative_unlocks (profile_id, beat_id) values ($1, $2)`,
      [moi, beatId],
    );

    const res = await asUser(
      moi,
      `update public.user_narrative_unlocks set read_at = now() where profile_id = '${moi}'`,
    );
    assert.equal(res.affectedRows, 0);
  });

  test('écrire du contenu narratif est rejeté', async () => {
    const message = await rejects(() =>
      asUser(
        moi,
        `insert into public.narrative_beats (track, order_index, trigger_type, trigger_value, title, body)
         values ('main', 921, 'global_level', 1, '', '')`,
      ),
    );
    assert.match(message, /row-level security/);
  });
});

describe('count_workouts_by_sport', () => {
  test('compte les séances par sport, sans regarder la classe du joueur', async () => {
    const userId = await createUser('compte-sports@grindrise.test');
    await db.query(`insert into public.sports (id, name) values ('test2', 'Test 2')`);

    await db.query(
      `insert into public.workout_logs (profile_id, sport_id) values ($1, 'test'), ($1, 'test'), ($1, 'test2')`,
      [userId],
    );

    const { rows } = await db.query(
      `select sport_id, sessions from public.count_workouts_by_sport($1) order by sport_id`,
      [userId],
    );

    assert.deepEqual(rows, [
      { sport_id: 'test', sessions: 2 },
      { sport_id: 'test2', sessions: 1 },
    ]);
  });

  test('un profil sans séance ne renvoie aucune ligne', async () => {
    const userId = await createUser('compte-vide@grindrise.test');
    const { rows } = await db.query(
      `select * from public.count_workouts_by_sport($1)`,
      [userId],
    );
    assert.equal(rows.length, 0);
  });

  test('le mobile ne peut pas l’appeler', async () => {
    const userId = await createUser('compte-interdit@grindrise.test');
    const message = await rejects(() =>
      asUser(userId, `select * from public.count_workouts_by_sport('${userId}'::uuid)`),
    );
    assert.match(message, /permission denied/i);
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
      sportId = 'test',
      performedAt = 'now()',
      workoutXp = 100,
      streakXp = 0,
      streakDays = 1,
      dailyLimit = 2,
      minGapMinutes = 30,
    } = options;

    const { rows } = await db.query(
      `select public.log_workout_with_xp(
         $1::uuid, $2, ${performedAt}, '{"reps": 10}'::jsonb,
         $3, $4, $5, current_date,
         now() - interval '1 day', now() + interval '1 day',
         $6, $7
       ) as result`,
      [profileId, sportId, workoutXp, streakXp, streakDays, dailyLimit, minGapMinutes],
    );

    return rows[0].result;
  }

  test('un sport inconnu est refusé avec un code que l’API sait traduire', async () => {
    // Sans ce contrôle, la clé étrangère refuserait aussi — mais l'API ne
    // pourrait pas distinguer cette violation d'une panne, et répondrait 500 à
    // ce qui est une faute de requête.
    const userId = await createUser('sport-inconnu@grindrise.test');

    try {
      await logWorkout(userId, { sportId: 'quidditch' });
      assert.fail('la requête a réussi alors qu’elle devait être rejetée');
    } catch (error) {
      assert.equal(error.code, 'GR001');
      assert.match(error.message, /sport inconnu/i);
    }

    // Rien n'a été écrit : le contrôle précède l'insertion.
    const { rows } = await db.query(
      `select count(*)::int as total from public.workout_logs where profile_id = $1`,
      [userId],
    );
    assert.equal(rows[0].total, 0);
  });

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

describe('catalogue d’exercices', () => {
  let moi;
  let autrui;
  let predefini;

  before(async () => {
    moi = await createUser('catalogue-moi@grindrise.test');
    autrui = await createUser('catalogue-autrui@grindrise.test');

    const { rows } = await db.query(
      `insert into public.exercises (name, muscle_group)
       values ('Développé test', 'pectoraux') returning id`,
    );
    predefini = rows[0].id;

    await db.query(
      `insert into public.exercises (name, muscle_group, created_by)
       values ('Curl secret', 'biceps', $1)`,
      [autrui],
    );
  });

  test('un exercice prédéfini est lisible par tout utilisateur connecté', async () => {
    const { rows } = await asUser(
      moi,
      `select count(*)::int as n from public.exercises where created_by is null`,
    );
    assert.ok(rows[0].n >= 1);
  });

  test('l’exercice custom d’autrui est invisible', async () => {
    const { rows } = await asUser(
      moi,
      `select count(*)::int as n from public.exercises where name = 'Curl secret'`,
    );
    assert.equal(rows[0].n, 0);
  });

  test('on ne peut pas créer un exercice au nom d’autrui', async () => {
    const message = await rejects(() =>
      asUser(
        moi,
        `insert into public.exercises (name, muscle_group, created_by)
         values ('Usurpation', 'dos', '${autrui}')`,
      ),
    );
    assert.match(message, /row-level security/);
  });

  test('on ne peut pas créer un exercice prédéfini', async () => {
    // `created_by = null` rendrait l'exercice visible de tous les utilisateurs
    // de l'app. Le catalogue de base se peuple par migration, pas par un client.
    const message = await rejects(() =>
      asUser(
        moi,
        `insert into public.exercises (name, muscle_group) values ('Faux prédéfini', 'dos')`,
      ),
    );
    assert.match(message, /row-level security/);
  });

  test('on ne peut pas promouvoir son exercice en prédéfini', async () => {
    // Le trou que `with check` referme : sans lui, un `update` suffirait à
    // publier son exercice auprès de tous.
    await db.query(
      `insert into public.exercises (name, muscle_group, created_by)
       values ('Mon curl', 'biceps', $1)`,
      [moi],
    );

    const message = await rejects(() =>
      asUser(
        moi,
        `update public.exercises set created_by = null where name = 'Mon curl'`,
      ),
    );
    assert.match(message, /row-level security/);
  });

  test('modifier un exercice prédéfini ne touche aucune ligne', async () => {
    // Pas d'erreur : sans ligne visible en écriture, la RLS filtre en amont et
    // l'update réussit à vide. « Pas d'erreur » ne vaut jamais « écrit ».
    const res = await asUser(
      moi,
      `update public.exercises set name = 'Détourné' where id = '${predefini}'`,
    );
    assert.equal(res.affectedRows ?? 0, 0);
  });
});

describe('programmes', () => {
  let moi;
  let autrui;
  let programme;
  let jour;

  before(async () => {
    moi = await createUser('programme-moi@grindrise.test');
    autrui = await createUser('programme-autrui@grindrise.test');

    const p = await db.query(
      `insert into public.programs (profile_id, sport_id, name)
       values ($1, 'test', 'Push Pull Legs') returning id`,
      [moi],
    );
    programme = p.rows[0].id;

    const j = await db.query(
      `insert into public.program_workouts (program_id, name, order_index)
       values ($1, 'Jour Push', 0) returning id`,
      [programme],
    );
    jour = j.rows[0].id;
  });

  test('le propriétaire voit son programme et ses jours', async () => {
    const { rows } = await asUser(
      moi,
      `select (select count(*) from public.programs where id = '${programme}')::int as p,
              (select count(*) from public.program_workouts where id = '${jour}')::int as j`,
    );
    assert.equal(rows[0].p, 1);
    assert.equal(rows[0].j, 1);
  });

  test('le programme et les jours d’autrui sont invisibles', async () => {
    const { rows } = await asUser(
      autrui,
      `select (select count(*) from public.programs where id = '${programme}')::int as p,
              (select count(*) from public.program_workouts where id = '${jour}')::int as j`,
    );
    assert.equal(rows[0].p, 0);
    assert.equal(rows[0].j, 0);
  });

  test('ajouter un jour au programme d’autrui est rejeté', async () => {
    const message = await rejects(() =>
      asUser(
        autrui,
        `insert into public.program_workouts (program_id, name, order_index)
         values ('${programme}', 'Intrusion', 9)`,
      ),
    );
    assert.match(message, /row-level security/);
  });

  test('deux jours ne peuvent pas occuper le même rang', async () => {
    const message = await rejects(() =>
      db.query(
        `insert into public.program_workouts (program_id, name, order_index)
         values ($1, 'Doublon', 0)`,
        [programme],
      ),
    );
    assert.match(message, /program_workouts_order_unique/);
  });

  test('supprimer un programme emporte ses jours', async () => {
    const p = await db.query(
      `insert into public.programs (profile_id, sport_id, name)
       values ($1, 'test', 'Jetable') returning id`,
      [moi],
    );
    await db.query(
      `insert into public.program_workouts (program_id, name, order_index)
       values ($1, 'Jour', 0)`,
      [p.rows[0].id],
    );

    await db.query(`delete from public.programs where id = $1`, [p.rows[0].id]);

    const { rows } = await db.query(
      `select count(*)::int as n from public.program_workouts where program_id = $1`,
      [p.rows[0].id],
    );
    assert.equal(rows[0].n, 0);
  });
});

describe('séances structurées', () => {
  let moi;
  let seance;
  let exercice;
  let logue;

  before(async () => {
    moi = await createUser('seance-structuree@grindrise.test');

    const e = await db.query(
      `insert into public.exercises (name, muscle_group)
       values ('Squat test', 'quadriceps') returning id`,
    );
    exercice = e.rows[0].id;

    const w = await db.query(
      `insert into public.workout_logs (profile_id, sport_id) values ($1, 'test') returning id`,
      [moi],
    );
    seance = w.rows[0].id;

    const le = await db.query(
      `insert into public.logged_exercises (workout_log_id, exercise_id, order_index)
       values ($1, $2, 0) returning id`,
      [seance, exercice],
    );
    logue = le.rows[0].id;

    await db.query(
      `insert into public.logged_sets (logged_exercise_id, set_index, type, reps, weight_kg)
       values ($1, 0, 'reps', 10, 80)`,
      [logue],
    );
  });

  test('une série en répétitions sans répétition est rejetée', async () => {
    const message = await rejects(() =>
      db.query(
        `insert into public.logged_sets (logged_exercise_id, set_index, type)
         values ($1, 90, 'reps')`,
        [logue],
      ),
    );
    assert.match(message, /logged_sets_shape_matches_type/);
  });

  test('une série au temps ne peut pas porter de répétitions', async () => {
    const message = await rejects(() =>
      db.query(
        `insert into public.logged_sets (logged_exercise_id, set_index, type, reps, duration_seconds)
         values ($1, 91, 'time', 10, 60)`,
        [logue],
      ),
    );
    assert.match(message, /logged_sets_shape_matches_type/);
  });

  test('le propriétaire lit ses exercices et ses séries', async () => {
    const { rows } = await asUser(
      moi,
      `select (select count(*) from public.logged_exercises where id = '${logue}')::int as e,
              (select count(*) from public.logged_sets where logged_exercise_id = '${logue}')::int as s`,
    );
    assert.equal(rows[0].e, 1);
    assert.equal(rows[0].s, 1);
  });

  test('écrire une série en direct est rejeté — l’API est le seul chemin', async () => {
    const message = await rejects(() =>
      asUser(
        moi,
        `insert into public.logged_sets (logged_exercise_id, set_index, type, reps)
         values ('${logue}', 50, 'reps', 10)`,
      ),
    );
    assert.match(message, /row-level security/);
  });

  test('ajouter un exercice à sa propre séance est rejeté', async () => {
    const message = await rejects(() =>
      asUser(
        moi,
        `insert into public.logged_exercises (workout_log_id, exercise_id, order_index)
         values ('${seance}', '${exercice}', 5)`,
      ),
    );
    assert.match(message, /row-level security/);
  });

  test('supprimer le programme suivi laisse la séance en place', async () => {
    const p = await db.query(
      `insert into public.programs (profile_id, sport_id, name)
       values ($1, 'test', 'Éphémère') returning id`,
      [moi],
    );
    const j = await db.query(
      `insert into public.program_workouts (program_id, name, order_index)
       values ($1, 'Jour', 0) returning id`,
      [p.rows[0].id],
    );
    const w = await db.query(
      `insert into public.workout_logs (profile_id, sport_id, program_workout_id)
       values ($1, 'test', $2) returning id`,
      [moi, j.rows[0].id],
    );

    await db.query(`delete from public.programs where id = $1`, [p.rows[0].id]);

    const { rows } = await db.query(
      `select program_workout_id from public.workout_logs where id = $1`,
      [w.rows[0].id],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].program_workout_id, null);
  });

  test('supprimer un exercice encore utilisé est rejeté', async () => {
    const message = await rejects(() =>
      db.query(`delete from public.exercises where id = $1`, [exercice]),
    );
    assert.match(message, /logged_exercises/);
  });

  test('supprimer le compte purge tout, exercice custom utilisé compris (RGPD)', async () => {
    // Le piège des cascades croisées : `workout_logs → logged_exercises` d'un
    // côté, `exercises.created_by` de l'autre. En `restrict`, cette suppression
    // échouerait selon l'ordre des triggers. C'est la preuve que `no action`
    // était le bon choix.
    const jetable = await createUser('rgpd-muscu@grindrise.test');

    const e = await db.query(
      `insert into public.exercises (name, muscle_group, created_by)
       values ('Exercice perso', 'dos', $1) returning id`,
      [jetable],
    );
    const w = await db.query(
      `insert into public.workout_logs (profile_id, sport_id) values ($1, 'test') returning id`,
      [jetable],
    );
    const le = await db.query(
      `insert into public.logged_exercises (workout_log_id, exercise_id, order_index)
       values ($1, $2, 0) returning id`,
      [w.rows[0].id, e.rows[0].id],
    );
    await db.query(
      `insert into public.logged_sets (logged_exercise_id, set_index, type, reps)
       values ($1, 0, 'reps', 12)`,
      [le.rows[0].id],
    );

    await db.query(`delete from auth.users where id = $1`, [jetable]);

    const { rows } = await db.query(
      `select
         (select count(*) from public.exercises where created_by = $1)::int as exercices,
         (select count(*) from public.logged_sets where logged_exercise_id = $2)::int as series`,
      [jetable, le.rows[0].id],
    );
    assert.equal(rows[0].exercices, 0);
    assert.equal(rows[0].series, 0);
  });
});
