import { validateEnv } from './env.config';

const complete = {
  SUPABASE_URL: 'https://exemple.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
};

/**
 * Ce qu'il faut ajouter pour produire des notifications.
 *
 * Les trois vont ensemble : dès que la queue existe, l'API peut envoyer des
 * emails de palier, qui doivent porter un lien de désabonnement — donc être
 * signés, et pointer quelque part.
 */
const avecQueue = {
  REDIS_URL: 'redis://127.0.0.1:6379',
  UNSUBSCRIBE_TOKEN_SECRET: 'secret-de-test-assez-long-pour-etre-credible',
  PUBLIC_API_URL: 'https://api.exemple.test',
};

describe('validateEnv', () => {
  it('accepte un environnement sans Redis', () => {
    // Redis reste optionnel : l'imposer rendrait impossible tout développement
    // local du backend sans lancer un service de plus. Même exception que
    // REVENUECAT_WEBHOOK_SECRET.
    const config = validateEnv(complete);

    expect(config.redisUrl).toBeUndefined();
  });

  it('retient REDIS_URL quand elle est fournie', () => {
    const config = validateEnv({ ...complete, ...avecQueue });

    expect(config.redisUrl).toBe('redis://127.0.0.1:6379');
  });

  it('nomme la queue « notifications » par défaut', () => {
    expect(validateEnv(complete).notificationsQueueName).toBe('notifications');
  });

  it('accepte un nom de queue personnalisé', () => {
    const config = validateEnv({
      ...complete,
      NOTIFICATIONS_QUEUE_NAME: 'notifs-test',
    });

    expect(config.notificationsQueueName).toBe('notifs-test');
  });

  it("n'autorise aucune origine par défaut", () => {
    expect(validateEnv(complete).corsAllowedOrigins).toEqual([]);
  });

  it('découpe CORS_ALLOWED_ORIGINS sur les virgules, espaces compris', () => {
    const config = validateEnv({
      ...complete,
      CORS_ALLOWED_ORIGINS:
        ' https://app.grindrise.fr , http://localhost:5173 ,, ',
    });

    expect(config.corsAllowedOrigins).toEqual([
      'https://app.grindrise.fr',
      'http://localhost:5173',
    ]);
  });

  it('refuse le joker au boot plutôt qu’à la première requête', () => {
    expect(() =>
      validateEnv({ ...complete, CORS_ALLOWED_ORIGINS: '*' }),
    ).toThrow(/CORS_ALLOWED_ORIGINS.*\*/s);
  });

  it('refuse une barre finale, qui ne correspondrait à aucun en-tête Origin', () => {
    expect(() =>
      validateEnv({
        ...complete,
        CORS_ALLOWED_ORIGINS: 'https://app.grindrise.fr/',
      }),
    ).toThrow(/sans barre finale/);
  });

  it('refuse une valeur qui n’est pas une URL', () => {
    expect(() =>
      validateEnv({ ...complete, CORS_ALLOWED_ORIGINS: 'app.grindrise.fr' }),
    ).toThrow(/n'est pas une origine valide/);
  });

  it('laisse le désabonnement non configuré tant qu’aucune queue n’existe', () => {
    // Sans Redis, aucun email ne part : il n'y a aucun lien à signer, et
    // imposer ces variables rendrait le développement local plus lourd sans
    // rien protéger.
    const config = validateEnv(complete);

    expect(config.unsubscribeTokenSecret).toBeUndefined();
    expect(config.publicApiUrl).toBeUndefined();
  });

  it('refuse de démarrer avec une queue mais sans de quoi composer un lien', () => {
    // Le cas que cette règle empêche : une API qui envoie des emails de palier
    // auxquels il est impossible de se désabonner.
    expect(() =>
      validateEnv({ ...complete, REDIS_URL: 'redis://127.0.0.1:6379' }),
    ).toThrow(/UNSUBSCRIBE_TOKEN_SECRET et PUBLIC_API_URL sont requises/);
  });

  it('nomme la seule variable manquante quand l’autre est là', () => {
    expect(() =>
      validateEnv({
        ...complete,
        ...avecQueue,
        PUBLIC_API_URL: '',
      }),
    ).toThrow(/PUBLIC_API_URL est requise/);
  });

  it('refuse un secret de signature trop court', () => {
    expect(() =>
      validateEnv({ ...complete, UNSUBSCRIBE_TOKEN_SECRET: 'trop-court' }),
    ).toThrow(/UNSUBSCRIBE_TOKEN_SECRET fait 10 caractères/);
  });

  it('normalise PUBLIC_API_URL en origine nue', () => {
    const config = validateEnv({
      ...complete,
      ...avecQueue,
      PUBLIC_API_URL: 'https://api.exemple.test/',
    });

    // Sans ce rognage, le lien composé porterait une double barre.
    expect(config.publicApiUrl).toBe('https://api.exemple.test');
  });

  it('refuse une PUBLIC_API_URL qui n’est pas une URL http', () => {
    expect(() =>
      validateEnv({ ...complete, PUBLIC_API_URL: 'api.exemple.test' }),
    ).toThrow(/PUBLIC_API_URL invalide/);

    expect(() =>
      validateEnv({ ...complete, PUBLIC_API_URL: 'ftp://api.exemple.test' }),
    ).toThrow(/http ou https/);
  });

  it('refuse toujours de démarrer sans les variables Supabase', () => {
    expect(() => validateEnv({})).toThrow(
      /SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY/s,
    );
  });
});
