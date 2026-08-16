import { validateEnv } from './env.config';

const complete = {
  SUPABASE_URL: 'https://exemple.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
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
    const config = validateEnv({
      ...complete,
      REDIS_URL: 'redis://127.0.0.1:6379',
    });

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

  it('refuse toujours de démarrer sans les variables Supabase', () => {
    expect(() => validateEnv({})).toThrow(
      /SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY/s,
    );
  });
});
