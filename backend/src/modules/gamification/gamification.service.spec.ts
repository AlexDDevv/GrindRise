import { BadRequestException, NotFoundException } from '@nestjs/common';

import { GamificationService } from './gamification.service';
import { SupabaseService } from '../../supabase/supabase.service';

/**
 * `recomputeProgress` est le filet de sécurité du game design : c'est lui qui
 * réaligne tous les niveaux après un rééquilibrage de la courbe. Sa propriété
 * décisive n'est pas d'être juste une fois, mais de converger — deux exécutions
 * doivent donner le même résultat, sans quoi le rejouer serait dangereux.
 */
describe('GamificationService.recomputeProgress', () => {
  const PROFILE_ID = '3f8b1c2e-6d4a-4f1b-9c7e-2a5d8e0b4f16';

  type Tables = {
    xp_events: { amount: number }[];
    level_thresholds: { level: number; xp_required: number }[];
    workout_logs: { performed_at: string }[];
    profiles: { timezone: string };
  };

  /** Chaque `update` reçu est conservé : c'est le résultat qu'on compare. */
  function buildService(tables: Tables) {
    const updates: Record<string, unknown>[] = [];

    const builderFor = (table: keyof Tables) => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        gte: () => builder,
        order: () => builder,
        maybeSingle: () =>
          Promise.resolve({ data: tables.profiles, error: null }),
        single: () =>
          Promise.resolve({
            data: updates[updates.length - 1],
            error: null,
          }),
        update: (values: Record<string, unknown>) => {
          updates.push(values);
          return builder;
        },
        then: (
          onFulfilled: (value: { data: unknown; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) =>
          Promise.resolve({ data: tables[table], error: null }).then(
            onFulfilled,
            onRejected,
          ),
      };

      return builder;
    };

    const supabase = {
      client: { from: (table: keyof Tables) => builderFor(table) },
    } as unknown as SupabaseService;

    return { service: new GamificationService(supabase), updates };
  }

  const PALIERS = [
    { level: 1, xp_required: 0 },
    { level: 2, xp_required: 100 },
    { level: 3, xp_required: 215 },
    { level: 4, xp_required: 347 },
  ];

  it('déduit le niveau de la somme des événements', async () => {
    const { service, updates } = buildService({
      xp_events: [{ amount: 100 }, { amount: 85 }, { amount: 40 }],
      level_thresholds: PALIERS,
      workout_logs: [],
      profiles: { timezone: 'Europe/Paris' },
    });

    await service.recomputeProgress(PROFILE_ID);

    expect(updates[0]).toMatchObject({ current_xp: 225, level: 3 });
  });

  it('converge : deux exécutions successives donnent le même résultat', async () => {
    const tables: Tables = {
      xp_events: [{ amount: 100 }, { amount: 25 }],
      level_thresholds: PALIERS,
      workout_logs: [
        { performed_at: '2026-08-09T18:00:00.000Z' },
        { performed_at: '2026-08-10T18:00:00.000Z' },
      ],
      profiles: { timezone: 'Europe/Paris' },
    };

    const { service, updates } = buildService(tables);

    await service.recomputeProgress(PROFILE_ID);
    await service.recomputeProgress(PROFILE_ID);

    const { updated_at: _premier, ...premier } = updates[0];
    const { updated_at: _second, ...second } = updates[1];

    // Rien n'est incrémenté, tout est resommé : rejouer ne dérive pas.
    expect(second).toEqual(premier);
  });

  it('réaligne les niveaux quand la courbe change, sans toucher aux événements', async () => {
    const xpEvents = [{ amount: 100 }, { amount: 85 }];

    const avant = buildService({
      xp_events: xpEvents,
      level_thresholds: PALIERS,
      workout_logs: [],
      profiles: { timezone: 'Europe/Paris' },
    });
    await avant.service.recomputeProgress(PROFILE_ID);

    // Courbe durcie : le même total ne vaut plus le même niveau.
    const apres = buildService({
      xp_events: xpEvents,
      level_thresholds: [
        { level: 1, xp_required: 0 },
        { level: 2, xp_required: 200 },
        { level: 3, xp_required: 500 },
      ],
      workout_logs: [],
      profiles: { timezone: 'Europe/Paris' },
    });
    await apres.service.recomputeProgress(PROFILE_ID);

    expect(avant.updates[0]).toMatchObject({ current_xp: 185, level: 2 });
    expect(apres.updates[0]).toMatchObject({ current_xp: 185, level: 1 });
  });

  it('reconstitue le streak dans le fuseau du joueur', async () => {
    // 22 h UTC les 9 et 10 août = minuit passé les 10 et 11 à Paris. Un
    // découpage UTC verrait deux jours consécutifs se terminant le 10 ; le
    // découpage local voit les 10 et 11.
    const { service, updates } = buildService({
      xp_events: [],
      level_thresholds: PALIERS,
      workout_logs: [
        { performed_at: '2026-08-09T22:30:00.000Z' },
        { performed_at: '2026-08-10T22:30:00.000Z' },
      ],
      profiles: { timezone: 'Europe/Paris' },
    });

    await service.recomputeProgress(PROFILE_ID);

    expect(updates[0]).toMatchObject({
      streak_days: 2,
      last_workout_on: '2026-08-11',
    });
  });

  it('remet à zéro une progression sans aucune séance', async () => {
    const { service, updates } = buildService({
      xp_events: [],
      level_thresholds: PALIERS,
      workout_logs: [],
      profiles: { timezone: 'Europe/Paris' },
    });

    await service.recomputeProgress(PROFILE_ID);

    expect(updates[0]).toMatchObject({
      current_xp: 0,
      level: 1,
      streak_days: 0,
      last_workout_on: null,
    });
  });
});

describe('GamificationService.awardXpForWorkout', () => {
  const PROFILE_ID = '3f8b1c2e-6d4a-4f1b-9c7e-2a5d8e0b4f16';
  const EXERCICE_ID = '9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f';
  const JOUR_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

  /** Bouchon minimal : un historique vide, et une RPC qui enregistre ses arguments. */
  function buildService(rpcError: { code?: string; message: string } | null = null) {
    const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      gte: () => builder,
      order: () => builder,
      maybeSingle: () =>
        Promise.resolve({ data: { timezone: 'Europe/Paris' }, error: null }),
      then: (onFulfilled: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(onFulfilled),
    };

    const supabase = {
      client: {
        from: () => builder,
        rpc: (fn: string, args: Record<string, unknown>) => {
          rpcCalls.push({ fn, args });
          return Promise.resolve({
            data: rpcError
              ? null
              : {
                  workout: { id: 'w1' },
                  progress: { profile_id: PROFILE_ID, level: 2 },
                  xp_awarded: 60,
                  capped_reason: null,
                  exercises: [],
                },
            error: rpcError,
          });
        },
      },
    } as unknown as SupabaseService;

    return { service: new GamificationService(supabase), rpcCalls };
  }

  /**
   * L'instant courant, et non une date fixe : la fenêtre d'antériorité est de
   * sept jours, donc un `performedAt` codé en dur ferait échouer ces tests le
   * jour où on les relance.
   */
  function seance(overrides: Record<string, unknown> = {}) {
    return {
      sportId: 'musculation',
      performedAt: new Date(),
      metrics: {},
      timeZone: 'Europe/Paris',
      levelBefore: 1,
      ...overrides,
    };
  }

  it('transmet les exercices et le jour de programme à la RPC', async () => {
    // Le payload part en snake_case : c'est la forme que la RPC désassemble,
    // et la traduction depuis le DTO a déjà eu lieu en amont.
    const { service, rpcCalls } = buildService();

    await service.awardXpForWorkout(
      PROFILE_ID,
      seance({
        exercises: [
          {
            exercise_id: EXERCICE_ID,
            sets: [
              {
                type: 'reps',
                reps: 10,
                duration_seconds: null,
                weight_kg: 80,
                is_bodyweight: false,
              },
            ],
          },
        ],
        programWorkoutId: JOUR_ID,
      }),
    );

    const appel = rpcCalls.find((c) => c.fn === 'log_workout_with_xp');
    expect(appel?.args.p_exercises).toEqual([
      {
        exercise_id: EXERCICE_ID,
        sets: [
          {
            type: 'reps',
            reps: 10,
            duration_seconds: null,
            weight_kg: 80,
            is_bodyweight: false,
          },
        ],
      },
    ]);
    expect(appel?.args.p_program_workout_id).toBe(JOUR_ID);
    // L'identité vient du jeton, jamais du corps.
    expect(appel?.args.p_profile_id).toBe(PROFILE_ID);
  });

  it('envoie null quand la séance n’est pas structurée', async () => {
    const { service, rpcCalls } = buildService();

    await service.awardXpForWorkout(
      PROFILE_ID,
      seance({ sportId: 'course', metrics: { distanceKm: 8 } }),
    );

    const appel = rpcCalls.find((c) => c.fn === 'log_workout_with_xp');
    expect(appel?.args.p_exercises).toBeNull();
    expect(appel?.args.p_program_workout_id).toBeNull();
  });

  it('traduit GR002 en 400 — c’est une faute du client', async () => {
    const { service } = buildService({
      code: 'GR002',
      message: 'exercice inconnu ou inaccessible',
    });

    await expect(
      service.awardXpForWorkout(PROFILE_ID, seance({ exercises: [] })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('traduit GR003 en 404 — un 403 confirmerait que l’identifiant existe', async () => {
    const { service } = buildService({
      code: 'GR003',
      message: 'jour de programme inaccessible',
    });

    await expect(
      service.awardXpForWorkout(
        PROFILE_ID,
        seance({ exercises: [], programWorkoutId: JOUR_ID }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
