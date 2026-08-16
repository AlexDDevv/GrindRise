/**
 * Validation des variables d'environnement au démarrage.
 *
 * On échoue immédiatement plutôt qu'au premier appel Supabase : un container
 * mal configuré doit crasher au boot pour que CapRover le signale tout de suite.
 */

export type AppConfig = {
  port: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /**
   * Secret partagé avec RevenueCat (en-tête `Authorization` du webhook).
   * Optionnel tant que le webhook n'est pas branché.
   */
  revenuecatWebhookSecret?: string;
  /**
   * Connexion Redis pour la queue de notifications.
   *
   * Optionnelle, contrairement à la règle « crash au boot si une variable
   * manque » : l'imposer rendrait Redis obligatoire pour tout développement
   * local du backend. Absente, le producteur de notifications reste silencieux
   * et le signale au démarrage. Même exception que le secret RevenueCat.
   */
  redisUrl?: string;
  /** Doit correspondre à celui du service de notifications. */
  notificationsQueueName: string;
};

export function validateEnv(raw: Record<string, unknown>): AppConfig {
  const missing: string[] = [];

  const read = (key: string): string => {
    const value = raw[key];
    if (typeof value !== 'string' || value.trim() === '') {
      missing.push(key);
      return '';
    }
    return value;
  };

  const supabaseUrl = read('SUPABASE_URL');
  const supabaseServiceRoleKey = read('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Variables d'environnement manquantes : ${missing.join(', ')}. ` +
        'Voir .env.example.',
    );
  }

  const port = Number(raw.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT invalide : ${String(raw.PORT)}`);
  }

  const revenuecatWebhookSecret =
    typeof raw.REVENUECAT_WEBHOOK_SECRET === 'string' &&
    raw.REVENUECAT_WEBHOOK_SECRET !== ''
      ? raw.REVENUECAT_WEBHOOK_SECRET
      : undefined;

  const redisUrl =
    typeof raw.REDIS_URL === 'string' && raw.REDIS_URL.trim() !== ''
      ? raw.REDIS_URL.trim()
      : undefined;

  const notificationsQueueName =
    typeof raw.NOTIFICATIONS_QUEUE_NAME === 'string' &&
    raw.NOTIFICATIONS_QUEUE_NAME.trim() !== ''
      ? raw.NOTIFICATIONS_QUEUE_NAME.trim()
      : 'notifications';

  return {
    port,
    supabaseUrl,
    supabaseServiceRoleKey,
    revenuecatWebhookSecret,
    redisUrl,
    notificationsQueueName,
  };
}
