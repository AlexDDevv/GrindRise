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
