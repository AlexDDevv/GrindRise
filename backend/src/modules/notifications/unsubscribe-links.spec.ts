import { UnsubscribeLinks, createUnsubscribeLinks } from './unsubscribe-links';

const PROFILE_ID = '11111111-1111-1111-1111-111111111111';
const SECRET = 'secret-de-test-assez-long-pour-etre-credible';
const AUTRE_SECRET = 'autre-secret-tout-aussi-long-mais-different';
const API_URL = 'https://api.exemple.test';

function links(secret = SECRET): UnsubscribeLinks {
  return new UnsubscribeLinks(secret, API_URL);
}

function tokenOf(url: string): string {
  return new URL(url).searchParams.get('token') ?? '';
}

describe('UnsubscribeLinks', () => {
  it('compose une URL absolue vers l’endpoint de désabonnement', () => {
    const url = new URL(links().urlFor(PROFILE_ID));

    expect(url.origin).toBe(API_URL);
    expect(url.pathname).toBe('/notifications/unsubscribe');
    expect(url.searchParams.get('token')).toBeTruthy();
  });

  it('relit le profil qu’elle a signé', () => {
    const token = tokenOf(links().urlFor(PROFILE_ID));

    expect(links().profileIdFrom(token)).toBe(PROFILE_ID);
  });

  it('produit le même jeton d’un appel à l’autre', () => {
    // Pas d'aléa ni d'horodatage dans la signature : deux emails de paliers
    // différents portent le même lien, et un lien reste valable des mois plus
    // tard, quand il est enfin cliqué.
    expect(links().urlFor(PROFILE_ID)).toBe(links().urlFor(PROFILE_ID));
  });

  it('n’expose pas le jeton sous une forme qu’un tiers pourrait rejouer ailleurs', () => {
    const token = tokenOf(links().urlFor(PROFILE_ID));

    // L'identifiant reste lisible — ce n'est pas un secret, il circule déjà
    // dans les jetons Supabase. Ce qui protège, c'est la signature qui suit.
    expect(token.startsWith(`${PROFILE_ID}.`)).toBe(true);
    expect(token.slice(PROFILE_ID.length + 1)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejette une signature altérée', () => {
    const token = tokenOf(links().urlFor(PROFILE_ID));
    const falsifie = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

    expect(links().profileIdFrom(falsifie)).toBeNull();
  });

  it('rejette un identifiant substitué à celui qui a été signé', () => {
    const token = tokenOf(links().urlFor(PROFILE_ID));
    const autrui = token.replace(
      PROFILE_ID,
      '22222222-2222-2222-2222-222222222222',
    );

    expect(links().profileIdFrom(autrui)).toBeNull();
  });

  it('rejette un jeton signé avec un autre secret', () => {
    const token = tokenOf(links(AUTRE_SECRET).urlFor(PROFILE_ID));

    expect(links().profileIdFrom(token)).toBeNull();
  });

  it('rejette un jeton sans signature', () => {
    expect(links().profileIdFrom(PROFILE_ID)).toBeNull();
    expect(links().profileIdFrom('')).toBeNull();
    expect(links().profileIdFrom('.')).toBeNull();
  });
});

describe('createUnsubscribeLinks', () => {
  it('rend null tant que la configuration est incomplète', () => {
    expect(
      createUnsubscribeLinks({ unsubscribeTokenSecret: SECRET }),
    ).toBeNull();
    expect(createUnsubscribeLinks({ publicApiUrl: API_URL })).toBeNull();
    expect(createUnsubscribeLinks({})).toBeNull();
  });

  it('rend un composeur de liens dès que les deux valeurs sont là', () => {
    const created = createUnsubscribeLinks({
      unsubscribeTokenSecret: SECRET,
      publicApiUrl: API_URL,
    });

    expect(created?.urlFor(PROFILE_ID)).toBe(links().urlFor(PROFILE_ID));
  });
});
