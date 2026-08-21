import { WorkoutsService } from './workouts.service';

const PROFILE_ID = '11111111-1111-1111-1111-111111111111';

function award(
  levelBefore: number,
  levelAfter: number,
  exercises: unknown[] = [],
) {
  return {
    workout: { id: 'w1' },
    xpAwarded: 80,
    breakdown: {},
    levelBefore,
    levelAfter,
    cappedReason: null,
    progress: { profile_id: PROFILE_ID, level: levelAfter, current_xp: 400 },
    /** Ce que la RPC a relu en base. Vide pour un sport à log plat. */
    exercises,
  };
}

function build(overrides: {
  levelBefore: number;
  levelAfter: number;
  enqueue?: jest.Mock;
  /** `profiles.notify_level_up` du joueur. Abonné sauf mention contraire. */
  notifyLevelUp?: boolean;
  /** Exercices que la transaction est censée avoir écrits. */
  exercises?: unknown[];
}) {
  const enqueue = overrides.enqueue ?? jest.fn(() => Promise.resolve());

  const users = {
    getProfile: jest.fn(() =>
      Promise.resolve({
        profile: {
          id: PROFILE_ID,
          username: 'Ferrum',
          timezone: 'Europe/Paris',
          notify_level_up: overrides.notifyLevelUp ?? true,
        },
        progress: { level: overrides.levelBefore },
      }),
    ),
  };
  const gamification = {
    awardXpForWorkout: jest.fn(() =>
      Promise.resolve(
        award(
          overrides.levelBefore,
          overrides.levelAfter,
          overrides.exercises ?? [],
        ),
      ),
    ),
  };
  const narrative = { syncUnlocks: jest.fn(() => Promise.resolve([])) };
  const notifications = { enqueueLevelUp: enqueue };

  const service = new WorkoutsService(
    users as never,
    gamification as never,
    narrative as never,
    notifications as never,
  );

  return { service, enqueue, gamification };
}

const input = {
  sportId: 'running',
  performedAt: '2026-08-16T09:00:00.000Z',
  metrics: {},
};

describe('WorkoutsService.createWorkoutLog', () => {
  it('produit une notification quand un palier est franchi', async () => {
    const { service, enqueue } = build({ levelBefore: 4, levelAfter: 5 });

    await service.createWorkoutLog(PROFILE_ID, input);

    expect(enqueue).toHaveBeenCalledWith(PROFILE_ID, {
      username: 'Ferrum',
      levelBefore: 4,
      levelAfter: 5,
      notifyLevelUp: true,
    });
  });

  it('transmet la préférence de notification lue sur le profil', async () => {
    // Le profil est déjà chargé en tête de méthode : la préférence voyage avec
    // le pseudo, sans requête supplémentaire. C'est le producteur qui en tire
    // les conséquences — ici, on vérifie seulement qu'elle ne se perd pas en
    // route.
    const { service, enqueue } = build({
      levelBefore: 4,
      levelAfter: 5,
      notifyLevelUp: false,
    });

    await service.createWorkoutLog(PROFILE_ID, input);

    expect(enqueue).toHaveBeenCalledWith(
      PROFILE_ID,
      expect.objectContaining({ notifyLevelUp: false }),
    );
  });

  it('ne produit rien quand le niveau ne bouge pas', async () => {
    const { service, enqueue } = build({ levelBefore: 5, levelAfter: 5 });

    await service.createWorkoutLog(PROFILE_ID, input);

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('enregistre la séance même si la mise en queue échoue', async () => {
    // Best-effort, exactement comme syncUnlocks : l'XP est déjà créditée à ce
    // moment-là. Un 500 ferait ressaisir une séance qui serait alors refusée
    // comme trop rapprochée par l'anti-triche.
    const enqueue = jest.fn(() =>
      Promise.reject(new Error('Redis injoignable')),
    );
    const { service } = build({ levelBefore: 4, levelAfter: 5, enqueue });

    const result = await service.createWorkoutLog(PROFILE_ID, input);

    expect(result.award.leveledUp).toBe(true);
    expect(result.progress.level).toBe(5);
  });
});

describe('séance structurée', () => {
  const EXERCICE_ID = '9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f';

  const seanceMuscu = {
    sportId: 'musculation',
    performedAt: '2026-08-20T10:00:00.000Z',
    exercises: [
      {
        exerciseId: EXERCICE_ID,
        sets: [
          {
            type: 'reps' as const,
            reps: 10,
            weightKg: 80,
            isBodyweight: false,
          },
          { type: 'time' as const, durationSeconds: 45, isBodyweight: true },
        ],
      },
    ],
  };

  it('traduit le DTO en forme de base avant de le transmettre', async () => {
    // Le client parle camelCase, la base snake_case. La traduction a lieu ici
    // et nulle part ailleurs : le service de gamification ne connaît pas les DTO.
    const { service, gamification } = build({ levelBefore: 4, levelAfter: 4 });

    await service.createWorkoutLog(PROFILE_ID, seanceMuscu);

    expect(gamification.awardXpForWorkout).toHaveBeenCalledWith(
      PROFILE_ID,
      expect.objectContaining({
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
              {
                type: 'time',
                reps: null,
                duration_seconds: 45,
                weight_kg: null,
                is_bodyweight: true,
              },
            ],
          },
        ],
      }),
    );
  });

  it('renvoie les statistiques calculées depuis ce qui est en base', async () => {
    // Depuis la base et non depuis le DTO : ce qui est rapporté au client est
    // ce qui est stocké, rangs et arrondis compris. D'où des exercices de
    // retour volontairement différents de ceux envoyés.
    const { service } = build({
      levelBefore: 4,
      levelAfter: 4,
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
            {
              type: 'reps',
              reps: 8,
              duration_seconds: null,
              weight_kg: null,
              is_bodyweight: true,
            },
          ],
        },
      ],
    });

    const result = await service.createWorkoutLog(PROFILE_ID, seanceMuscu);

    expect(result.strength?.stats.totalSets).toBe(2);
    expect(result.strength?.stats.totalReps).toBe(18);
    expect(result.strength?.stats.tonnageKg).toBe(800);
    // Le poids de corps arrive dans un chantier séparé : le total est amputé,
    // et il le dit plutôt que de compter la série à zéro.
    expect(result.strength?.stats.tonnagePartial).toBe(true);
  });

  it('laisse `strength` nul pour un sport à log plat', async () => {
    const { service } = build({ levelBefore: 4, levelAfter: 4 });

    const result = await service.createWorkoutLog(PROFILE_ID, {
      sportId: 'course',
      performedAt: '2026-08-20T10:00:00.000Z',
      metrics: { distanceKm: 8 },
    });

    expect(result.strength).toBeNull();
  });
});
