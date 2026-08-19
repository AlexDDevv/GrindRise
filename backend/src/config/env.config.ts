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
  /**
   * Clé HMAC signant les liens de désabonnement des emails de palier.
   *
   * Optionnelle **seulement tant que `REDIS_URL` est absente** : sans queue,
   * aucun email ne part, il n'y a donc aucun lien à signer. Dès que l'API peut
   * produire des notifications, elle devient requise — un email de palier sans
   * moyen de s'en désabonner n'a pas le droit de partir.
   *
   * La changer invalide tous les liens déjà envoyés : à traiter comme un
   * secret durable, pas comme une valeur qu'on fait tourner.
   */
  unsubscribeTokenSecret?: string;
  /**
   * URL publique de l'API, servant à composer le lien de désabonnement.
   *
   * L'API ne peut pas la deviner : derrière le proxy CapRover elle ne voit que
   * son port interne. Même règle d'optionalité que le secret ci-dessus.
   */
  publicApiUrl?: string;
};

/**
 * Longueur minimale du secret de signature.
 *
 * 32 caractères, soit l'ordre de grandeur d'une sortie de 256 bits encodée.
 * En dessous, un lien de désabonnement devient forgeable par force brute, et
 * on désabonnerait n'importe qui. La contrainte est vérifiée au boot parce
 * qu'un secret faible ne se remarque jamais autrement.
 */
const MIN_SECRET_LENGTH = 32;

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

  const unsubscribeTokenSecret = readUnsubscribeSecret(raw);
  const publicApiUrl = readPublicApiUrl(raw);

  // La règle du crash au boot rattrape ici ce que l'optionalité de REDIS_URL
  // avait relâché : Redis configurée, c'est une API qui produit des emails de
  // palier. Sans lien de désabonnement, ces emails sont illégaux — mieux vaut
  // un container qui ne monte pas qu'un envoi non conforme.
  if (redisUrl && (!unsubscribeTokenSecret || !publicApiUrl)) {
    const absentes = [
      unsubscribeTokenSecret ? null : 'UNSUBSCRIBE_TOKEN_SECRET',
      publicApiUrl ? null : 'PUBLIC_API_URL',
    ].filter((name): name is string => name !== null);

    throw new Error(
      `REDIS_URL est configurée, donc l'API produit des emails de palier : ` +
        `${absentes.join(' et ')} ${absentes.length > 1 ? 'sont requises' : 'est requise'} ` +
        'pour y joindre un lien de désabonnement. Voir .env.example.',
    );
  }

  return {
    port,
    supabaseUrl,
    supabaseServiceRoleKey,
    revenuecatWebhookSecret,
    redisUrl,
    notificationsQueueName,
    corsAllowedOrigins: parseAllowedOrigins(raw.CORS_ALLOWED_ORIGINS),
    unsubscribeTokenSecret,
    publicApiUrl,
  };
}

function readUnsubscribeSecret(
  raw: Record<string, unknown>,
): string | undefined {
  const value = raw.UNSUBSCRIBE_TOKEN_SECRET;
  if (typeof value !== 'string' || value.trim() === '') return undefined;

  const secret = value.trim();
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `UNSUBSCRIBE_TOKEN_SECRET fait ${secret.length} caractères, ` +
        `${MIN_SECRET_LENGTH} au minimum sont attendus. ` +
        'En générer un : openssl rand -base64 48.',
    );
  }

  return secret;
}

/** Origine nue, sans barre finale : le chemin est ajouté à la composition. */
function readPublicApiUrl(raw: Record<string, unknown>): string | undefined {
  const value = raw.PUBLIC_API_URL;
  if (typeof value !== 'string' || value.trim() === '') return undefined;

  const candidate = value.trim().replace(/\/+$/, '');

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(
      `PUBLIC_API_URL invalide : « ${candidate} ». ` +
        'Attendu : https://api.exemple.fr.',
    );
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(
      `PUBLIC_API_URL doit être en http ou https, reçu « ${parsed.protocol} ».`,
    );
  }

  return candidate;
}
