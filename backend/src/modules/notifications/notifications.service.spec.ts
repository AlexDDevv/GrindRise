import { LEVEL_UP_JOB_NAME, LEVEL_UP_JOB_VERSION } from './contract';
import {
  NotificationsService,
  type LevelUpInput,
} from './notifications.service';
import { UnsubscribeLinks } from './unsubscribe-links';

const PROFILE_ID = '11111111-1111-1111-1111-111111111111';
const SECRET = 'secret-de-test-assez-long-pour-etre-credible';
const API_URL = 'https://api.exemple.test';

type AddCall = [string, Record<string, unknown>, Record<string, unknown>];

function unsubscribeLinks(): UnsubscribeLinks {
  return new UnsubscribeLinks(SECRET, API_URL);
}

/** Entrée par défaut : un joueur abonné franchissant le palier 5. */
function levelUp(overrides: Partial<LevelUpInput> = {}): LevelUpInput {
  return {
    username: null,
    levelBefore: 4,
    levelAfter: 5,
    notifyLevelUp: true,
    ...overrides,
  };
}

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
      unsubscribeLinks(),
      fakeSupabase('joueur@exemple.fr') as never,
    );

    await service.enqueueLevelUp(PROFILE_ID, levelUp({ username: 'Ferrum' }));

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
      unsubscribeLinks(),
      fakeSupabase('joueur@exemple.fr') as never,
    );

    await service.enqueueLevelUp(PROFILE_ID, levelUp());

    expect(calls[0][2].jobId).toBe(`${LEVEL_UP_JOB_NAME}:${PROFILE_ID}:5`);
  });

  it('transmet la politique de reprise du contrat', async () => {
    const { queue, calls } = fakeQueue();
    const service = new NotificationsService(
      queue as never,
      unsubscribeLinks(),
      fakeSupabase('joueur@exemple.fr') as never,
    );

    await service.enqueueLevelUp(
      PROFILE_ID,
      levelUp({ levelBefore: 1, levelAfter: 2 }),
    );

    expect(calls[0][2]).toMatchObject({ attempts: 8 });
  });

  it('joint au job un lien de désabonnement signé', async () => {
    const { queue, calls } = fakeQueue();
    const service = new NotificationsService(
      queue as never,
      unsubscribeLinks(),
      fakeSupabase('joueur@exemple.fr') as never,
    );

    await service.enqueueLevelUp(PROFILE_ID, levelUp());

    const url = new URL(calls[0][1].unsubscribeUrl as string);
    expect(url.origin).toBe(API_URL);
    expect(url.pathname).toBe('/notifications/unsubscribe');
    // Le lien doit désigner CE profil, et le prouver par sa signature : c'est
    // toute la différence avec un profileId en clair dans l'URL.
    expect(
      unsubscribeLinks().profileIdFrom(url.searchParams.get('token') ?? ''),
    ).toBe(PROFILE_ID);
  });

  it("n'empile rien quand le joueur s'est désabonné", async () => {
    // Le cœur de la mesure : le refus se joue avant la queue, pas dans le
    // worker. Un job empilé finirait par partir, par une reprise ou un rejeu.
    const { queue, calls } = fakeQueue();
    const supabase = fakeSupabase('joueur@exemple.fr');
    const service = new NotificationsService(
      queue as never,
      unsubscribeLinks(),
      supabase as never,
    );

    await service.enqueueLevelUp(PROFILE_ID, levelUp({ notifyLevelUp: false }));

    expect(calls).toHaveLength(0);
    // Pas même la lecture de l'adresse : rien de ce joueur n'est consulté.
    expect(supabase.client.auth.admin.getUserById).not.toHaveBeenCalled();
  });

  it("n'empile rien quand aucun lien de désabonnement n'est composable", async () => {
    // Configuration incomplète : plutôt qu'un email sans moyen de s'en
    // désabonner, on n'envoie pas. Cas impossible en production, où
    // validateEnv exige les deux variables dès que REDIS_URL est posée.
    const { queue, calls } = fakeQueue();
    const service = new NotificationsService(
      queue as never,
      null,
      fakeSupabase('joueur@exemple.fr') as never,
    );

    await service.enqueueLevelUp(PROFILE_ID, levelUp());

    expect(calls).toHaveLength(0);
  });

  it("ne fait rien quand Redis n'est pas configurée", async () => {
    const supabase = fakeSupabase('joueur@exemple.fr');
    const service = new NotificationsService(
      null,
      unsubscribeLinks(),
      supabase as never,
    );

    await service.enqueueLevelUp(PROFILE_ID, levelUp());

    // Pas même la lecture de l'email : inutile de solliciter Supabase pour un
    // job qui n'ira nulle part.
    expect(supabase.client.auth.admin.getUserById).not.toHaveBeenCalled();
  });

  it("renonce sans erreur quand le compte n'a pas d'email", async () => {
    const { queue, calls } = fakeQueue();
    const service = new NotificationsService(
      queue as never,
      unsubscribeLinks(),
      fakeSupabase(null) as never,
    );

    await service.enqueueLevelUp(PROFILE_ID, levelUp());

    expect(calls).toHaveLength(0);
  });

  it('refuse de pousser un job incohérent', async () => {
    // Le producteur valide son propre message avec la même fonction que le
    // worker : une incohérence se voit ici, pas trois secondes plus tard dans
    // les logs d'un autre service.
    const { queue } = fakeQueue();
    const service = new NotificationsService(
      queue as never,
      unsubscribeLinks(),
      fakeSupabase('joueur@exemple.fr') as never,
    );

    await expect(
      service.enqueueLevelUp(
        PROFILE_ID,
        levelUp({ levelBefore: 5, levelAfter: 5 }),
      ),
    ).rejects.toThrow(/levelAfter/);
  });
});

/** Une promesse qui ne se résout jamais : la panne mesurée, pas simulée. */
function neverSettles<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

/**
 * Rend la main dès que `enqueueLevelUp` répond, ou après `ms` de temps simulé.
 *
 * Sans ce départage, un appel qui pend ferait simplement expirer Jest au bout
 * de cinq secondes : on saurait que quelque chose bloque, pas quoi.
 */
async function raceAgainstClock(
  work: Promise<void>,
  ms: number,
): Promise<'rendu' | 'bloqué'> {
  return Promise.race([
    work.then(() => 'rendu' as const),
    jest.advanceTimersByTimeAsync(ms).then(() => 'bloqué' as const),
  ]);
}

describe('NotificationsService.enqueueLevelUp — garde-temps', () => {
  // Temps simulé : le garde-temps réel dure deux secondes, la suite n'a pas à
  // les attendre.
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('rend la main quand queue.add ne répond jamais', async () => {
    // Le cas d'un REDIS_URL au mot de passe erroné : BullMQ attend que la
    // connexion soit « prête » avant d'empiler, ioredis retente sans fin, et
    // `maxRetriesPerRequest` ne borne que les commandes d'une connexion déjà
    // établie. La requête HTTP du joueur pendait indéfiniment.
    const queue = { add: jest.fn(() => neverSettles<{ id: string }>()) };
    const service = new NotificationsService(
      queue as never,
      unsubscribeLinks(),
      fakeSupabase('joueur@exemple.fr') as never,
    );

    const outcome = await raceAgainstClock(
      service.enqueueLevelUp(PROFILE_ID, levelUp()),
      30_000,
    );

    expect(outcome).toBe('rendu');
    expect(queue.add).toHaveBeenCalled();
  });

  it("rend la main quand la lecture de l'email ne répond jamais", async () => {
    // Même classe de panne, un cran plus tôt : `getUserById` est un appel
    // réseau awaité dans le chemin de la requête, et `fetch` n'a pas de délai
    // d'expiration par défaut. Le garde-temps couvre donc toute la méthode.
    const supabase = {
      client: {
        auth: {
          admin: { getUserById: jest.fn(() => neverSettles<unknown>()) },
        },
      },
    };
    const { queue, calls } = fakeQueue();
    const service = new NotificationsService(
      queue as never,
      unsubscribeLinks(),
      supabase as never,
    );

    const outcome = await raceAgainstClock(
      service.enqueueLevelUp(PROFILE_ID, levelUp()),
      30_000,
    );

    expect(outcome).toBe('rendu');
    expect(calls).toHaveLength(0);
  });
});

type ProfilesResult = {
  data?: { id: string } | null;
  error?: { message: string } | null;
};

/**
 * Bouchon de PostgREST limité à l'écriture de `profiles`.
 *
 * Les appels sont enregistrés : c'est la seule façon de vérifier qu'un jeton
 * refusé n'a produit AUCUNE écriture, et pas seulement une écriture sans effet.
 */
function fakeProfiles(result: ProfilesResult = {}) {
  const updates: Record<string, unknown>[] = [];
  const filters: [string, unknown][] = [];

  const builder = {
    update(values: Record<string, unknown>) {
      updates.push(values);
      return builder;
    },
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return builder;
    },
    select: () => builder,
    maybeSingle: () =>
      Promise.resolve({
        data: result.data ?? null,
        error: result.error ?? null,
      }),
  };

  return {
    supabase: { client: { from: jest.fn(() => builder) } },
    updates,
    filters,
  };
}

describe('NotificationsService.unsubscribeFromLevelUp', () => {
  const tokenFor = (profileId: string): string =>
    new URL(unsubscribeLinks().urlFor(profileId)).searchParams.get('token') ??
    '';

  it('bascule la préférence du profil désigné par le jeton', async () => {
    const { supabase, updates, filters } = fakeProfiles({
      data: { id: PROFILE_ID },
    });
    const service = new NotificationsService(
      null,
      unsubscribeLinks(),
      supabase as never,
    );

    const outcome = await service.unsubscribeFromLevelUp(tokenFor(PROFILE_ID));

    expect(outcome).toBe('desabonne');
    expect(updates).toEqual([{ notify_level_up: false }]);
    expect(filters).toEqual([['id', PROFILE_ID]]);
  });

  it('refuse un jeton dont la signature a été modifiée', async () => {
    const { supabase, updates } = fakeProfiles({ data: { id: PROFILE_ID } });
    const service = new NotificationsService(
      null,
      unsubscribeLinks(),
      supabase as never,
    );

    const falsifie = `${tokenFor(PROFILE_ID).slice(0, -1)}X`;

    expect(await service.unsubscribeFromLevelUp(falsifie)).toBe(
      'lien-invalide',
    );
    expect(updates).toHaveLength(0);
  });

  it('refuse un identifiant de profil substitué à celui qui a été signé', async () => {
    // Sans signature, il suffirait de connaître l'UUID de quelqu'un pour le
    // désabonner. Avec, changer l'identifiant invalide le jeton.
    const { supabase, updates } = fakeProfiles({ data: { id: PROFILE_ID } });
    const service = new NotificationsService(
      null,
      unsubscribeLinks(),
      supabase as never,
    );

    const token = tokenFor(PROFILE_ID);
    const autrui = token.replace(
      PROFILE_ID,
      '22222222-2222-2222-2222-222222222222',
    );

    expect(await service.unsubscribeFromLevelUp(autrui)).toBe('lien-invalide');
    expect(updates).toHaveLength(0);
  });

  it('refuse un jeton vide', async () => {
    const { supabase, updates } = fakeProfiles();
    const service = new NotificationsService(
      null,
      unsubscribeLinks(),
      supabase as never,
    );

    expect(await service.unsubscribeFromLevelUp('')).toBe('lien-invalide');
    expect(updates).toHaveLength(0);
  });

  it('refuse un jeton signé quand le profil a disparu', async () => {
    // Compte supprimé depuis l'envoi de l'email : l'UPDATE ne touche aucune
    // ligne et réussit à vide. « Pas d'erreur » ne vaut pas « écrit ».
    const { supabase } = fakeProfiles({ data: null });
    const service = new NotificationsService(
      null,
      unsubscribeLinks(),
      supabase as never,
    );

    expect(await service.unsubscribeFromLevelUp(tokenFor(PROFILE_ID))).toBe(
      'lien-invalide',
    );
  });

  it('annonce une indisponibilité quand la base échoue', async () => {
    const { supabase } = fakeProfiles({
      error: { message: 'base injoignable' },
    });
    const service = new NotificationsService(
      null,
      unsubscribeLinks(),
      supabase as never,
    );

    expect(await service.unsubscribeFromLevelUp(tokenFor(PROFILE_ID))).toBe(
      'indisponible',
    );
  });

  it('annonce une indisponibilité quand le secret de signature manque', async () => {
    const { supabase, updates } = fakeProfiles();
    const service = new NotificationsService(null, null, supabase as never);

    expect(await service.unsubscribeFromLevelUp(tokenFor(PROFILE_ID))).toBe(
      'indisponible',
    );
    expect(updates).toHaveLength(0);
  });
});
