import { WorkoutsService } from './workouts.service';

const PROFILE_ID = '11111111-1111-1111-1111-111111111111';

function award(levelBefore: number, levelAfter: number) {
  return {
    workout: { id: 'w1' },
    xpAwarded: 80,
    breakdown: {},
    levelBefore,
    levelAfter,
    cappedReason: null,
    progress: { profile_id: PROFILE_ID, level: levelAfter, current_xp: 400 },
  };
}

function build(overrides: {
  levelBefore: number;
  levelAfter: number;
  enqueue?: jest.Mock;
  /** `profiles.notify_level_up` du joueur. Abonné sauf mention contraire. */
  notifyLevelUp?: boolean;
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
      Promise.resolve(award(overrides.levelBefore, overrides.levelAfter)),
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

  return { service, enqueue };
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
