import { timingSafeEqual } from 'node:crypto';

/**
 * Vocabulaire des droits payants et lecture du webhook RevenueCat.
 *
 * Trois décisions vivent ici, et aucune n'a besoin de Postgres ni de Nest pour
 * être vraie : ce qu'est un événement recevable, ce qu'il change, et si
 * l'appelant a le droit de parler. Les garder en fonctions pures les rend
 * éprouvables cas par cas — même raison d'être que `xp-rules.ts` et
 * `narrative-rules.ts`.
 *
 * Ce fichier est la source de vérité du vocabulaire. Le futur miroir mobile
 * (`mobile/src/lib/entitlementErrors.ts`, chantier suivant — voir spec §8) le
 * recopiera : `mobile/` et `backend/` s'installent indépendamment, ce n'est
 * pas un workspace pnpm.
 */

/** Miroir de l'enum `public.entitlement_plan`. */
export type EntitlementPlan = 'freemium' | 'subscription' | 'lifetime';

/** Miroir de l'enum `public.entitlement_status`. */
export type EntitlementStatus =
  | 'active'
  | 'in_grace_period'
  | 'cancelled'
  | 'expired';

/**
 * Un événement RevenueCat, réduit à ce que l'API en lit.
 *
 * Volontairement pauvre : `product_id`, `price`, `store` et le reste ne servent
 * à aucune décision ici. Les accepter dans le type donnerait l'illusion qu'ils
 * comptent, et la première personne à les lire y attacherait une règle.
 */
export type RevenueCatEvent = {
  type: string;
  /** App User ID = UUID Supabase du profil. */
  appUserId: string;
  /** Quand l'événement s'est produit chez RevenueCat, pas quand il arrive. */
  eventAt: Date;
  /** Nul pour un achat définitif : un lifetime n'expire pas. */
  expiresAt: Date | null;
  /**
   * Identifiant RevenueCat du souscripteur, distinct de l'App User ID.
   *
   * Nul si l'événement ne le porte pas — un défaut d'écriture, jamais un rejet
   * de l'événement : ce champ ne sert à aucune décision ici, seulement à
   * retrouver le compte chez RevenueCat en cas de litige sur un remboursement.
   */
  originalAppUserId: string | null;
};

/**
 * Ce qu'un événement change sur la ligne `entitlements`.
 *
 * Deux formes, et la distinction est le cœur du modèle : ouvrir un droit dit à
 * la fois le plan et le statut, le terminer ne dit que le statut. Sans cette
 * séparation, une EXPIRATION sur un lifetime remboursé réécrirait son plan en
 * « subscription » — l'accès serait correctement retiré, et l'historique du
 * compte deviendrait faux.
 */
export type EntitlementTransition =
  | { kind: 'grant'; plan: EntitlementPlan; status: EntitlementStatus }
  | { kind: 'status'; status: EntitlementStatus };

/**
 * Des `Map` et non des objets littéraux : une recherche par index sur un objet
 * traverse la chaîne de prototypes, si bien que `transitionFor('constructor')`
 * rendait une ouverture — `JSON.stringify` y perdait le plan, et le PATCH
 * restant suffisait à rendre « actif » un droit expiré. `__proto__` produisait
 * un plan illisible, donc un 500 et un rejeu sans fin. Une `Map` ne connaît que
 * ses propres clés.
 */
const OUVERTURES: ReadonlyMap<string, EntitlementPlan> = new Map([
  ['INITIAL_PURCHASE', 'subscription'],
  ['RENEWAL', 'subscription'],
  ['PRODUCT_CHANGE', 'subscription'],
  ['UNCANCELLATION', 'subscription'],
  ['NON_RENEWING_PURCHASE', 'lifetime'],
]);

const FINS: ReadonlyMap<string, EntitlementStatus> = new Map([
  ['CANCELLATION', 'cancelled'],
  ['EXPIRATION', 'expired'],
  ['BILLING_ISSUE', 'in_grace_period'],
]);

/**
 * Forme canonique d'un UUID.
 *
 * `appUserId` finit dans un `where profile_id = …` sur une colonne `uuid` :
 * toute autre forme fait lever Postgres en 22P02, l'API répondrait 5xx et
 * RevenueCat rejouerait indéfiniment un événement que rien ne réparera. Le cas
 * n'a rien de théorique — un achat conclu avant que le SDK ait reçu une
 * identité arrive en `$RCAnonymousID:…`, qui ne désigne aucun compte ici.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Avance maximale tolérée sur l'horodatage d'un événement.
 *
 * Une tolérance existe parce que l'horloge de RevenueCat n'est pas la nôtre :
 * refuser toute date dépassant `now()` rejetterait des événements légitimes
 * pour quelques secondes de dérive. Elle reste courte parce qu'un horodatage
 * lointain est irréparable : il devient `last_event_at`, et tout événement
 * ultérieur — l'`EXPIRATION` qui doit retirer l'accès comprise — paraîtrait
 * périmé à jamais. Seul un `UPDATE` à la main y remédierait.
 */
const AVANCE_MAX_MS = 5 * 60_000;

/**
 * @returns `null` sur un type inconnu. RevenueCat en ajoute au fil du temps ;
 *   ne rien faire est le seul défaut acceptable, l'inverse accorderait un droit
 *   sur un événement qu'on ne comprend pas.
 */
export function transitionFor(eventType: string): EntitlementTransition | null {
  const plan = OUVERTURES.get(eventType);
  if (plan) return { kind: 'grant', plan, status: 'active' };

  const status = FINS.get(eventType);
  if (status) return { kind: 'status', status };

  return null;
}

/**
 * Lit le corps du webhook.
 *
 * RevenueCat poste `{ api_version, event: { … } }` : l'événement est imbriqué,
 * et le lire à plat rendrait chaque champ indéfini sans lever la moindre
 * erreur.
 *
 * @returns `null` si le corps n'a pas la forme attendue — champ manquant,
 *   identifiant qui n'est pas un UUID, horodatage absurde. L'appelant répond
 *   alors 200 sans écrire : aucun de ces défauts ne se répare par un rejeu.
 */
export function readEvent(body: unknown): RevenueCatEvent | null {
  if (typeof body !== 'object' || body === null) return null;

  const { event } = body as { event?: unknown };
  if (typeof event !== 'object' || event === null) return null;

  const {
    type,
    app_user_id,
    event_timestamp_ms,
    expiration_at_ms,
    original_app_user_id,
  } = event as Record<string, unknown>;

  if (typeof type !== 'string' || type === '') return null;
  // La forme de l'identifiant est une condition de recevabilité comme une
  // autre : un `$RCAnonymousID:…` n'est pas un profil, et le laisser passer
  // ferait lever Postgres au lieu de le journaliser.
  if (typeof app_user_id !== 'string' || !UUID.test(app_user_id)) return null;
  // Un horodatage non numérique produirait une Date invalide, dont toute
  // comparaison est fausse : le rejeu périmé cesserait d'être détecté.
  if (typeof event_timestamp_ms !== 'number' || !Number.isFinite(event_timestamp_ms)) {
    return null;
  }
  // Aucun événement légitime n'est notablement en avance sur l'horloge.
  if (event_timestamp_ms > Date.now() + AVANCE_MAX_MS) return null;

  return {
    type,
    appUserId: app_user_id,
    eventAt: new Date(event_timestamp_ms),
    expiresAt:
      typeof expiration_at_ms === 'number' && Number.isFinite(expiration_at_ms)
        ? new Date(expiration_at_ms)
        : null,
    originalAppUserId:
      typeof original_app_user_id === 'string' && original_app_user_id !== ''
        ? original_app_user_id
        : null,
  };
}

/**
 * L'appelant présente-t-il le secret partagé ?
 *
 * Comparaison à temps constant : une comparaison naïve fuit la position du
 * premier caractère faux, ce qui rend le secret devinable en le sondant
 * caractère par caractère. La garde de longueur précède l'appel parce que
 * `timingSafeEqual` lève sur des tampons de tailles différentes — sans elle, un
 * secret trop court ferait répondre 500 là où c'est un refus.
 */
export function isAuthorized(
  header: string | undefined,
  secret: string,
): boolean {
  if (typeof header !== 'string' || header === '') return false;

  const presente = Buffer.from(header);
  const attendu = Buffer.from(secret);

  if (presente.length !== attendu.length) return false;

  return timingSafeEqual(presente, attendu);
}
