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
  /**
   * Origines autorisées à appeler l'API depuis un navigateur
   * (`CORS_ALLOWED_ORIGINS`, séparées par des virgules).
   *
   * Vide par défaut, et c'est le bon défaut : aucune origine n'est autorisée
   * tant qu'on n'en nomme pas une. Le mobile natif n'est pas concerné — il
   * n'envoie pas d'en-tête `Origin` — donc une liste vide ne casse rien
   * aujourd'hui. Le jour où un dashboard web arrive, il s'ajoute ici, sans
   * redéploiement de code.
   */
  corsAllowedOrigins: string[];
};

/**
 * Découpe `CORS_ALLOWED_ORIGINS` en origines normalisées.
 *
 * Deux refus, tous deux au boot plutôt qu'à la première requête :
 *
 * - le joker `*`, qui rendrait la liste blanche décorative. Une API dont
 *   *toutes* les routes sont authentifiées n'a aucune raison d'être appelable
 *   depuis n'importe quelle page web ;
 * - une valeur qui n'est pas une origine nue (`https://exemple.fr`), parce que
 *   l'en-tête `Origin` d'un navigateur n'en est jamais une autre. Un
 *   `https://exemple.fr/` avec barre finale ne correspondrait à rien et se
 *   diagnostiquerait des heures plus tard, dans une console de navigateur.
 */
function parseAllowedOrigins(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];

  const origins = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

  for (const origin of origins) {
    if (origin === '*') {
      throw new Error(
        'CORS_ALLOWED_ORIGINS ne peut pas valoir « * » : toutes les routes de ' +
          "l'API sont authentifiées, aucune page tierce n'a à les appeler. " +
          'Nommer les origines une à une.',
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(
        `CORS_ALLOWED_ORIGINS : « ${origin} » n'est pas une origine valide. ` +
          'Attendu : schéma://hôte[:port], par exemple https://app.grindrise.fr.',
      );
    }

    // `URL.origin` recompose la forme canonique : tout écart (barre finale,
    // chemin, identifiants, fragment) se voit ici.
    if (parsed.origin !== origin) {
      throw new Error(
        `CORS_ALLOWED_ORIGINS : « ${origin} » porte autre chose qu'une origine. ` +
          `Attendu « ${parsed.origin} », sans barre finale ni chemin.`,
      );
    }
  }

  return [...new Set(origins)];
}

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
    corsAllowedOrigins: parseAllowedOrigins(raw.CORS_ALLOWED_ORIGINS),
  };
}
