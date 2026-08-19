import { createHmac, timingSafeEqual } from 'node:crypto';

import type { AppConfig } from '../../config/env.config';

/** Token d'injection : `null` quand le secret ou l'URL publique manque. */
export const UNSUBSCRIBE_LINKS = 'UNSUBSCRIBE_LINKS';

export type UnsubscribeLinksProvider = UnsubscribeLinks | null;

/** Chemin de l'endpoint, partagé entre le composeur d'URL et le contrôleur. */
export const UNSUBSCRIBE_PATH = '/notifications/unsubscribe';

/**
 * Portée de la signature.
 *
 * Elle entre dans le message signé pour qu'un jeton de désabonnement ne puisse
 * jamais être rejoué comme jeton d'autre chose, le jour où un second usage
 * signera lui aussi un identifiant de profil avec le même secret. Le suffixe de
 * version permettra d'en changer le format sans invalider silencieusement les
 * liens déjà partis dans des boîtes mail.
 */
const TOKEN_SCOPE = 'unsubscribe:level-up:v1';

/**
 * Liens de désabonnement signés.
 *
 * Le lien doit fonctionner **sans session applicative** : il est cliqué depuis
 * une boîte mail, des mois plus tard, souvent sur un autre appareil que celui
 * où l'app est installée. Exiger un JWT Supabase reviendrait à exiger une
 * connexion avant de pouvoir se désabonner — précisément ce que la loi
 * interdit de rendre difficile.
 *
 * D'où un HMAC plutôt que l'identifiant de profil en clair : l'URL porte la
 * preuve qu'elle a été composée par nous. Sans signature, il suffirait de
 * connaître l'UUID de quelqu'un — qui n'est pas un secret, il circule dans les
 * jetons — pour le désabonner à sa place.
 *
 * Pas d'expiration, volontairement : un email reste dans une boîte pour
 * toujours, et un lien de désabonnement périmé est un lien de désabonnement
 * cassé. Le risque est borné par ce que le jeton permet — basculer un booléen,
 * réversible d'un réglage dans l'app.
 */
export class UnsubscribeLinks {
  constructor(
    private readonly secret: string,
    private readonly publicApiUrl: string,
  ) {}

  /** URL absolue à glisser dans l'email. */
  urlFor(profileId: string): string {
    const url = new URL(`${this.publicApiUrl}${UNSUBSCRIBE_PATH}`);
    url.searchParams.set(
      'token',
      `${profileId}.${this.signatureFor(profileId)}`,
    );
    return url.toString();
  }

  /** Profil désigné par le jeton, ou `null` si la signature ne tient pas. */
  profileIdFrom(token: string): string | null {
    // L'identifiant est un UUID : il ne contient pas de point, la coupure est
    // donc sans ambiguïté.
    const separator = token.lastIndexOf('.');
    if (separator <= 0) return null;

    const profileId = token.slice(0, separator);
    const provided = Buffer.from(token.slice(separator + 1));
    const expected = Buffer.from(this.signatureFor(profileId));

    // `timingSafeEqual` lève si les longueurs diffèrent — ce qui n'apprend rien
    // à un attaquant, la longueur d'un HMAC-SHA256 étant fixe et connue.
    if (provided.length !== expected.length) return null;
    if (!timingSafeEqual(provided, expected)) return null;

    return profileId;
  }

  private signatureFor(profileId: string): string {
    return createHmac('sha256', this.secret)
      .update(`${TOKEN_SCOPE}:${profileId}`)
      .digest('base64url');
  }
}

export type UnsubscribeConfig = Pick<
  AppConfig,
  'unsubscribeTokenSecret' | 'publicApiUrl'
>;

/**
 * `null` quand la configuration est incomplète — cas cantonné au développement
 * local sans Redis : dès que `REDIS_URL` est posée, `validateEnv` exige les
 * deux variables et l'API refuse de démarrer sans elles.
 */
export function createUnsubscribeLinks(
  config: UnsubscribeConfig,
): UnsubscribeLinksProvider {
  if (!config.unsubscribeTokenSecret || !config.publicApiUrl) return null;

  return new UnsubscribeLinks(
    config.unsubscribeTokenSecret,
    config.publicApiUrl,
  );
}
