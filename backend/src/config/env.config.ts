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

  return { port, supabaseUrl, supabaseServiceRoleKey, revenuecatWebhookSecret };
}
