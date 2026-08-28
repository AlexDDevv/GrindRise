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
 * Ce fichier est la source de vérité du vocabulaire. Le miroir mobile
 * (`mobile/src/lib/entitlements.ts`) le recopie : `mobile/` et `backend/`
 * s'installent indépendamment, ce n'est pas un workspace pnpm.
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

const OUVERTURES: Readonly<Record<string, EntitlementPlan>> = {
  INITIAL_PURCHASE: 'subscription',
  RENEWAL: 'subscription',
  PRODUCT_CHANGE: 'subscription',
  UNCANCELLATION: 'subscription',
  NON_RENEWING_PURCHASE: 'lifetime',
};

const FINS: Readonly<Record<string, EntitlementStatus>> = {
  CANCELLATION: 'cancelled',
  EXPIRATION: 'expired',
  BILLING_ISSUE: 'in_grace_period',
};

/**
 * @returns `null` sur un type inconnu. RevenueCat en ajoute au fil du temps ;
 *   ne rien faire est le seul défaut acceptable, l'inverse accorderait un droit
 *   sur un événement qu'on ne comprend pas.
 */
export function transitionFor(eventType: string): EntitlementTransition | null {
  const plan = OUVERTURES[eventType];
  if (plan) return { kind: 'grant', plan, status: 'active' };

  const status = FINS[eventType];
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
 * @returns `null` si le corps n'a pas la forme attendue. L'appelant répond
 *   alors 200 sans écrire : un corps illisible ne se répare pas par un rejeu.
 */
export function readEvent(body: unknown): RevenueCatEvent | null {
  if (typeof body !== 'object' || body === null) return null;

  const { event } = body as { event?: unknown };
  if (typeof event !== 'object' || event === null) return null;

  const { type, app_user_id, event_timestamp_ms, expiration_at_ms } =
    event as Record<string, unknown>;

  if (typeof type !== 'string' || type === '') return null;
  if (typeof app_user_id !== 'string' || app_user_id === '') return null;
  // Un horodatage non numérique produirait une Date invalide, dont toute
  // comparaison est fausse : le rejeu périmé cesserait d'être détecté.
  if (typeof event_timestamp_ms !== 'number' || !Number.isFinite(event_timestamp_ms)) {
    return null;
  }

  return {
    type,
    appUserId: app_user_id,
    eventAt: new Date(event_timestamp_ms),
    expiresAt:
      typeof expiration_at_ms === 'number' && Number.isFinite(expiration_at_ms)
        ? new Date(expiration_at_ms)
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
