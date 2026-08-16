import { LEVEL_UP_JOB_NAME, LEVEL_UP_JOB_VERSION } from './contract';
import { NotificationsService } from './notifications.service';

const PROFILE_ID = '11111111-1111-1111-1111-111111111111';

type AddCall = [string, Record<string, unknown>, Record<string, unknown>];

function fakeQueue(): { queue: { add: jest.Mock }; calls: AddCall[] } {
  const calls: AddCall[] = [];
  const add = jest.fn((...args: AddCall) => {
    calls.push(args);
    return Promise.resolve({ id: 'job-1' });
  });
  return { queue: { add }, calls };
}

function fakeSupabase(email: string | null) {
  return {
    client: {
      auth: {
        admin: {
          getUserById: jest.fn(() =>
            Promise.resolve({
              data: { user: email ? { email } : null },
              error: null,
            }),
          ),
        },
      },
    },
  };
}

describe('NotificationsService.enqueueLevelUp', () => {
  it('pousse un job conforme au contrat', async () => {
    const { queue, calls } = fakeQueue();
    const service = new NotificationsService(
      queue as never,
      fakeSupabase('joueur@exemple.fr') as never,
    );

    await service.enqueueLevelUp(PROFILE_ID, {
      username: 'Ferrum',
      levelBefore: 4,
      levelAfter: 5,
    });

    const [name, payload] = calls[0];
    expect(name).toBe(LEVEL_UP_JOB_NAME);
    expect(payload).toMatchObject({
      version: LEVEL_UP_JOB_VERSION,
      profileId: PROFILE_ID,
      email: 'joueur@exemple.fr',
      username: 'Ferrum',
      levelBefore: 4,
      levelAfter: 5,
    });
    expect(typeof payload.occurredAt).toBe('string');
  });

  it('donne au job un identifiant déterministe', async () => {
    // C'est ce qui empêche deux séances franchissant le même palier
    // d'envoyer deux emails.
    const { queue, calls } = fakeQueue();
    const service = new NotificationsService(
      queue as never,
      fakeSupabase('joueur@exemple.fr') as never,
    );

    await service.enqueueLevelUp(PROFILE_ID, {
      username: null,
      levelBefore: 4,
      levelAfter: 5,
    });

    expect(calls[0][2].jobId).toBe(`${LEVEL_UP_JOB_NAME}:${PROFILE_ID}:5`);
  });

  it('transmet la politique de reprise du contrat', async () => {
    const { queue, calls } = fakeQueue();
    const service = new NotificationsService(
      queue as never,
      fakeSupabase('joueur@exemple.fr') as never,
    );

    await service.enqueueLevelUp(PROFILE_ID, {
      username: null,
      levelBefore: 1,
      levelAfter: 2,
    });

    expect(calls[0][2]).toMatchObject({ attempts: 5 });
  });

  it("ne fait rien quand Redis n'est pas configurée", async () => {
    const supabase = fakeSupabase('joueur@exemple.fr');
    const service = new NotificationsService(null, supabase as never);

    await service.enqueueLevelUp(PROFILE_ID, {
      username: null,
      levelBefore: 4,
      levelAfter: 5,
    });

    // Pas même la lecture de l'email : inutile de solliciter Supabase pour un
    // job qui n'ira nulle part.
    expect(supabase.client.auth.admin.getUserById).not.toHaveBeenCalled();
  });

  it("renonce sans erreur quand le compte n'a pas d'email", async () => {
    const { queue, calls } = fakeQueue();
    const service = new NotificationsService(
      queue as never,
      fakeSupabase(null) as never,
    );

    await service.enqueueLevelUp(PROFILE_ID, {
      username: null,
      levelBefore: 4,
      levelAfter: 5,
    });

    expect(calls).toHaveLength(0);
  });

  it('refuse de pousser un job incohérent', async () => {
    // Le producteur valide son propre message avec la même fonction que le
    // worker : une incohérence se voit ici, pas trois secondes plus tard dans
    // les logs d'un autre service.
    const { queue } = fakeQueue();
    const service = new NotificationsService(
      queue as never,
      fakeSupabase('joueur@exemple.fr') as never,
    );

    await expect(
      service.enqueueLevelUp(PROFILE_ID, {
        username: null,
        levelBefore: 5,
        levelAfter: 5,
      }),
    ).rejects.toThrow(/levelAfter/);
  });
});
