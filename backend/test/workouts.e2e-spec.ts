import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from 'jose';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { WorkoutCreated } from '../src/modules/workouts/workouts.service';
import { SupabaseService } from '../src/supabase/supabase.service';
import { startJwksServer, type JwksServer } from './jwks-server';

/**
 * `POST /workouts` de bout en bout : validation du corps, identité imposée par
 * le jeton, et forme de la réponse.
 *
 * La base est bouchonnée — ces tests ne doivent dépendre d'aucun projet
 * Supabase joignable — mais le `ValidationPipe` et le guard sont les vrais.
 * C'est ce qui compte ici : le rejet d'un champ `xp` est une propriété du pipe,
 * pas du service, et un bouchon de pipe ne prouverait rien.
 */
const KEY_ID = 'test-signing-key';
const PROFILE_ID = '3f8b1c2e-6d4a-4f1b-9c7e-2a5d8e0b4f16';
const AUTRUI_ID = '9a1d4e7c-2b3f-4a8d-8e6c-1f0b5d9a3c72';
const EXERCICE_ID = '9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f';

const PROFILE_ROW = {
  id: PROFILE_ID,
  username: 'grind',
  class_id: 'berserker',
  timezone: 'Europe/Paris',
  notify_level_up: true,
  created_at: '2026-08-11T09:00:00.000Z',
};

const PROGRESS_BEFORE = {
  profile_id: PROFILE_ID,
  level: 1,
  current_xp: 20,
  streak_days: 0,
  last_workout_on: null,
  updated_at: '2026-08-11T09:00:00.000Z',
};

const PROGRESS_AFTER = {
  ...PROGRESS_BEFORE,
  level: 2,
  current_xp: 120,
  streak_days: 1,
  last_workout_on: '2026-08-11',
};

const WORKOUT_ROW = {
  id: 'd0c9b8a7-1234-4321-9876-abcdef012345',
  profile_id: PROFILE_ID,
  sport_id: 'course',
  performed_at: '2026-08-11T09:30:00.000Z',
  metrics: { distanceKm: 8 },
  created_at: '2026-08-11T09:31:00.000Z',
};

/**
 * Bouchon de PostgREST.
 *
 * Les builders sont thenables, comme les vrais : `await from(...).select(...)`
 * doit résoudre sans appeler de méthode terminale. Les appels sont enregistrés,
 * puisque c'est la seule façon de vérifier que la RPC reçoit bien l'identité du
 * jeton et non celle du corps de requête.
 */
const db: {
  workoutDays: { performed_at: string }[];
  rpcResult: unknown;
  rpcError: { message: string; code?: string } | null;
  /**
   * Dernier appel d'octroi d'XP. Nommé précisément parce que la requête en
   * déclenche désormais un second, narratif : confondre les deux ferait passer
   * un test qui ne vérifie plus rien.
   */
  lastAwardRpc?: { fn: string; args: Record<string, unknown> };
  /** Réponse de `count_workouts_by_sport`, la RPC du module narratif. */
  sessionsBySport: { sport_id: string; sessions: number }[];
  narrativeError: { message: string } | null;
  /** Contenu narratif en base, et déblocages déjà acquis. */
  beats: Record<string, unknown>[];
  unlocks: { profile_id: string; beat_id: string }[];
  lastProfileQuery?: unknown;
} = {
  workoutDays: [],
  rpcResult: null,
  rpcError: null,
  sessionsBySport: [],
  narrativeError: null,
  beats: [],
  unlocks: [],
};

function tableBuilder(table: string) {
  const state: { value?: unknown } = {};
  let upserted: { beat_id: string }[] | null = null;

  const resolve = (): Promise<{ data: unknown; error: null }> => {
    // Un upsert en cours renvoie les lignes réellement insérées, comme le fait
    // `on conflict do nothing` : c'est ce qui distingue un déblocage neuf d'un
    // déblocage déjà acquis.
    if (upserted) return Promise.resolve({ data: upserted, error: null });

    if (table === 'workout_logs') {
      return Promise.resolve({ data: db.workoutDays, error: null });
    }
    if (table === 'narrative_beats') {
      return Promise.resolve({ data: db.beats, error: null });
    }
    if (table === 'user_narrative_unlocks') {
      return Promise.resolve({ data: db.unlocks, error: null });
    }
    return Promise.resolve({ data: [], error: null });
  };

  const builder = {
    select: () => builder,
    gte: () => builder,
    order: () => builder,
    upsert: (rows: { profile_id: string; beat_id: string }[]) => {
      const nouveaux = rows.filter(
        (row) => !db.unlocks.some((held) => held.beat_id === row.beat_id),
      );

      db.unlocks.push(...nouveaux);
      upserted = nouveaux.map((row) => ({ beat_id: row.beat_id }));
      return builder;
    },
    eq: (_column: string, value: unknown) => {
      state.value = value;
      return builder;
    },
    maybeSingle: () => {
      if (table === 'profiles') {
        db.lastProfileQuery = state.value;
        return Promise.resolve({
          data: { ...PROFILE_ROW, user_progress: PROGRESS_BEFORE },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
    // Rend le builder awaitable, comme un PostgrestFilterBuilder.
    then: (
      onFulfilled: (value: { data: unknown; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => resolve().then(onFulfilled, onRejected),
  };

  return builder;
}

const supabaseStub = {
  client: {
    from: (table: string) => tableBuilder(table),
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === 'count_workouts_by_sport') {
        return Promise.resolve({
          data: db.sessionsBySport,
          error: db.narrativeError,
        });
      }

      db.lastAwardRpc = { fn, args };
      // `exercises` reflète ce que le corps a réellement transmis (`p_exercises`)
      // plutôt qu'une valeur figée : un bug qui remonterait l'entrée au lieu du
      // retour de la base doit rester détectable depuis les tests du service, pas
      // masqué ici par un bouchon toujours vide.
      const result =
        db.rpcResult && typeof db.rpcResult === 'object'
          ? { exercises: args.p_exercises ?? [], ...db.rpcResult }
          : db.rpcResult;
      return Promise.resolve({ data: result, error: db.rpcError });
    },
  },
};

describe('POST /workouts (e2e)', () => {
  let app: INestApplication<App>;
  let jwks: JwksServer;
  let signingKey: KeyLike;
  let issuer: string;
  let token: string;

  beforeAll(async () => {
    const trusted = await generateKeyPair('ES256', { extractable: true });
    signingKey = trusted.privateKey;

    const publicJwk = await exportJWK(trusted.publicKey);
    jwks = await startJwksServer({
      ...publicJwk,
      kid: KEY_ID,
      alg: 'ES256',
      use: 'sig',
    });

    issuer = `${jwks.url}/auth/v1`;
    process.env.SUPABASE_URL = jwks.url;

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');
    /* eslint-enable @typescript-eslint/no-require-imports */

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseService)
      .useValue(supabaseStub)
      .compile();

    app = moduleFixture.createNestApplication();

    // Exactement le pipe de `main.ts`. Le recopier ici plutôt que de s'en
    // remettre à l'application réelle serait un test qui ne prouve rien : c'est
    // ce réglage précis qui fait échouer une requête portant un champ `xp`.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    const nowInSeconds = Math.floor(Date.now() / 1000);
    token = await new SignJWT({
      role: 'authenticated',
      email: 'grind@example.test',
    })
      .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setSubject(PROFILE_ID)
      .setIssuedAt(nowInSeconds - 60)
      .setExpirationTime(nowInSeconds + 3600)
      .sign(signingKey);
  });

  beforeEach(() => {
    db.workoutDays = [];
    db.rpcError = null;
    db.narrativeError = null;
    db.sessionsBySport = [];
    db.beats = [];
    db.unlocks = [];
    db.lastAwardRpc = undefined;
    db.rpcResult = {
      workout: WORKOUT_ROW,
      progress: PROGRESS_AFTER,
      xp_awarded: 100,
      capped_reason: null,
    };
  });

  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  /** Corps valide, daté de maintenant pour rester dans la fenêtre autorisée. */
  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      sportId: 'course',
      performedAt: new Date().toISOString(),
      metrics: { distanceKm: 8 },
      ...overrides,
    };
  }

  function post(body: unknown) {
    return request(app.getHttpServer())
      .post('/workouts')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  describe('le client ne peut pas s’attribuer d’XP', () => {
    it('rejette un champ `xp` au lieu de l’ignorer', async () => {
      // Le cœur du modèle anti-triche vu depuis l'API : sans
      // `forbidNonWhitelisted`, ce champ serait silencieusement écarté et
      // personne ne saurait qu'un client a essayé.
      const response = await post(validBody({ xp: 9999 })).expect(400);

      expect(JSON.stringify(response.body)).toContain('xp');
      // La requête n'a jamais atteint la base.
      expect(db.lastAwardRpc).toBeUndefined();
    });

    it('rejette un `xp` glissé dans les métriques', async () => {
      await post(validBody({ metrics: { distanceKm: 8, xp: 9999 } })).expect(
        400,
      );
      expect(db.lastAwardRpc).toBeUndefined();
    });

    it('rejette un `profileId` dans le corps', async () => {
      // L'identité vient du jeton ; l'accepter dans le corps, même ignorée,
      // laisserait croire qu'elle est négociable.
      await post(validBody({ profileId: AUTRUI_ID })).expect(400);
      expect(db.lastAwardRpc).toBeUndefined();
    });

    it('crédite le sujet du jeton, quoi qu’ait tenté l’appelant', async () => {
      await post(validBody()).expect(201);

      expect(db.lastAwardRpc?.fn).toBe('log_workout_with_xp');
      expect(db.lastAwardRpc?.args.p_profile_id).toBe(PROFILE_ID);
      expect(db.lastProfileQuery).toBe(PROFILE_ID);
    });

    it('déduit les montants côté serveur', async () => {
      await post(validBody()).expect(201);

      // 60 de présence + 40 d'effort : la séance de référence en course.
      expect(db.lastAwardRpc?.args.p_workout_xp).toBe(100);
      expect(db.lastAwardRpc?.args.p_daily_credited_limit).toBe(2);
      expect(db.lastAwardRpc?.args.p_min_gap_minutes).toBe(30);
    });
  });

  describe('validation du corps', () => {
    it('refuse une requête sans jeton', () => {
      return request(app.getHttpServer())
        .post('/workouts')
        .send(validBody())
        .expect(401);
    });

    it('refuse un `sportId` absent', () => {
      return post({ performedAt: new Date().toISOString() }).expect(400);
    });

    it('refuse une date qui n’est pas de l’ISO 8601', () => {
      return post(validBody({ performedAt: '11/08/2026' })).expect(400);
    });

    it('refuse une métrique hors de toute plausibilité humaine', () => {
      return post(validBody({ metrics: { distanceKm: 100_000 } })).expect(400);
    });

    it('refuse une métrique du mauvais type', () => {
      return post(validBody({ metrics: { distanceKm: 'beaucoup' } })).expect(
        400,
      );
    });

    it('accepte une séance sans métriques', async () => {
      // Le sport n'en exige pas forcément, et la présence seule vaut de l'XP.
      await post({
        sportId: 'yoga',
        performedAt: new Date().toISOString(),
      }).expect(201);

      expect(db.lastAwardRpc?.args.p_workout_xp).toBe(60);
    });
  });

  describe('règles métier', () => {
    it('refuse une séance plus ancienne que la fenêtre d’antériorité', async () => {
      const troisSemaines = new Date(Date.now() - 21 * 86_400_000);

      const response = await post(
        validBody({ performedAt: troisSemaines.toISOString() }),
      ).expect(400);

      expect(JSON.stringify(response.body)).toContain('7 jours');
      expect(db.lastAwardRpc).toBeUndefined();
    });

    it('refuse l’ancien format de musculation', async () => {
      // La rupture assumée du chantier : un client pas encore mis à jour doit
      // le savoir tout de suite, pas enregistrer une séance vide.
      await post(
        validBody({ sportId: 'musculation', metrics: { sets: 4 } }),
      ).expect(400);
    });

    it('refuse une séance de course portant des exercices', async () => {
      await post(
        validBody({
          sportId: 'course',
          exercises: [
            { exerciseId: EXERCICE_ID, sets: [{ type: 'reps', reps: 10 }] },
          ],
        }),
      ).expect(400);
    });

    it('transmet le streak recalculé depuis l’historique', async () => {
      const jour = (offset: number) =>
        new Date(Date.now() - offset * 86_400_000).toISOString();
      db.workoutDays = [{ performed_at: jour(2) }, { performed_at: jour(1) }];

      await post(validBody()).expect(201);

      // Deux jours consécutifs derrière, plus aujourd'hui : trois.
      expect(db.lastAwardRpc?.args.p_streak_days).toBe(3);
      // Le palier de 3 jours est franchi à cette séance.
      expect(db.lastAwardRpc?.args.p_streak_xp).toBe(10);
    });
  });

  describe('réponse', () => {
    it('reprend la forme de GET /users/me, augmentée du gain', async () => {
      const response = await post(validBody()).expect(201);

      expect(response.body).toEqual({
        profile: PROFILE_ROW,
        progress: PROGRESS_AFTER,
        award: {
          workout: WORKOUT_ROW,
          xpAwarded: 100,
          breakdown: { attendance: 60, effort: 40, streak: 0 },
          levelBefore: 1,
          levelAfter: 2,
          leveledUp: true,
          cappedReason: null,
        },
        narrative: { unlocked: [] },
        // Le champ existe, nul, plutôt que d'être absent : la course n'est pas
        // un sport à log structuré.
        strength: null,
      });
    });

    it('annonce le fragment que la séance vient d’ouvrir', async () => {
      // Le fragment est renvoyé pour que le mobile puisse l'annoncer au bon
      // moment, pas pour remplacer le codex : c'est lui qui reste la source de
      // vérité, et qui datera la lecture.
      db.beats = [
        {
          id: 'b1e4d7a2-0000-4000-8000-000000000001',
          track: 'sport:course',
          order_index: 1,
          trigger_type: 'sport_sessions_count',
          trigger_value: 3,
          sport_id: 'course',
          title: '',
          body: '',
          created_at: '2026-08-11T09:00:00.000Z',
        },
      ];
      db.sessionsBySport = [{ sport_id: 'course', sessions: 3 }];

      const response = await post(validBody()).expect(201);
      const { narrative } = response.body as WorkoutCreated;

      expect(narrative.unlocked.map((beat) => beat.track)).toEqual([
        'sport:course',
      ]);
    });

    it('n’annonce pas deux fois un fragment déjà débloqué', async () => {
      const beatId = 'b1e4d7a2-0000-4000-8000-000000000002';

      db.beats = [
        {
          id: beatId,
          track: 'main',
          order_index: 1,
          trigger_type: 'global_level',
          trigger_value: 2,
          sport_id: null,
          title: '',
          body: '',
          created_at: '2026-08-11T09:00:00.000Z',
        },
      ];
      db.unlocks = [{ profile_id: PROFILE_ID, beat_id: beatId }];

      const response = await post(validBody()).expect(201);
      const { narrative } = response.body as WorkoutCreated;

      expect(narrative.unlocked).toEqual([]);
    });

    it('une panne narrative laisse le champ vide plutôt que d’échouer', async () => {
      db.narrativeError = { message: 'narrative indisponible' };

      const response = await post(validBody()).expect(201);
      const { narrative } = response.body as WorkoutCreated;

      // L'absence de fragment ne prouve donc pas qu'aucun n'a été franchi —
      // c'est documenté sur le type, et le codex rattrape.
      expect(narrative.unlocked).toEqual([]);
    });

    it('dit pourquoi une séance plafonnée n’a rien rapporté', async () => {
      db.rpcResult = {
        workout: WORKOUT_ROW,
        progress: PROGRESS_BEFORE,
        xp_awarded: 0,
        capped_reason: 'daily_limit',
      };

      const response = await post(validBody()).expect(201);
      const { award } = response.body as WorkoutCreated;

      // La séance est enregistrée quand même : l'app reste un tracker.
      expect(award.workout).toEqual(WORKOUT_ROW);
      expect(award.xpAwarded).toBe(0);
      expect(award.cappedReason).toBe('daily_limit');
      // Aucun gain fantôme dans le détail.
      expect(award.breakdown).toEqual({ attendance: 0, effort: 0, streak: 0 });
      expect(award.leveledUp).toBe(false);
    });

    it('remonte une panne de base en 500, pas en réponse vide', async () => {
      db.rpcError = { message: 'connection reset' };

      await post(validBody()).expect(500);
    });

    it('une panne narrative ne perd pas la séance', async () => {
      // Le déblocage narratif est branché après l'octroi d'XP et hors de sa
      // transaction : s'il tombe, la séance est déjà écrite et créditée. La
      // remonter en 500 ferait croire au joueur qu'il doit ressaisir — et la
      // resaisie serait refusée comme trop rapprochée. Le rattrapage se fait à
      // la consultation suivante du codex.
      db.narrativeError = { message: 'narrative indisponible' };

      const response = await post(validBody()).expect(201);
      const { award } = response.body as WorkoutCreated;

      expect(award.xpAwarded).toBe(100);
    });

    it('traduit un sport inconnu en 400, pas en 500', async () => {
      // La fonction Postgres annonce elle-même la faute par son SQLSTATE. Sans
      // ce contrat, une requête malformée serait indistinguable d'une panne.
      db.rpcError = { message: 'sport inconnu : quidditch', code: 'GR001' };

      const response = await post(validBody({ sportId: 'quidditch' })).expect(
        400,
      );

      expect(JSON.stringify(response.body)).toContain('quidditch');
    });

    it('renvoie les statistiques d’une séance de musculation', async () => {
      const response = await post(
        validBody({
          sportId: 'musculation',
          // La musculation se logue en `exercises`, jamais en `metrics` : sans
          // cette annulation, le `metrics` par défaut de `validBody` resterait
          // et la requête serait rejetée par la cohérence sport/forme.
          metrics: undefined,
          exercises: [
            {
              exerciseId: EXERCICE_ID,
              sets: [{ type: 'reps', reps: 10, weightKg: 80 }],
            },
          ],
        }),
      ).expect(201);

      const body = response.body as WorkoutCreated;
      expect(body.strength?.stats.totalSets).toBe(1);
      expect(body.strength?.stats.tonnageKg).toBe(800);
      expect(body.strength?.stats.tonnagePartial).toBe(false);
    });
  });
});
