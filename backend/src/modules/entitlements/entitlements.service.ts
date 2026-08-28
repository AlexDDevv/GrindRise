import { Injectable, Logger } from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';

import { SupabaseService } from '../../supabase/supabase.service';
import type { Database } from '../../database.types';
import { transitionFor, type RevenueCatEvent } from './contract';

/**
 * « invalid input syntax for type … » : la valeur envoyée n'a pas la forme du
 * type de la colonne, typiquement un `profile_id` qui n'est pas un UUID.
 *
 * `readEvent` refuse déjà ces événements en amont ; ce code reste la ceinture,
 * parce qu'une erreur de forme ne se répare par aucun rejeu. La remonter ferait
 * répondre 5xx, et RevenueCat rejouerait jusqu'à l'abandon en noyant les vrais
 * incidents.
 */
const SYNTAXE_INVALIDE = '22P02';

/**
 * Détaille une erreur PostgREST pour le journal.
 *
 * `message` seul ne suffit pas à diagnostiquer : `code` dit s'il y a lieu de
 * rejouer, et `hint` porte le plus souvent l'action à mener. Ce service est
 * celui qu'on ne diagnostique que par ses logs — personne ne rejoue un webhook
 * à la main pour voir ce qu'il dirait.
 */
function detaille(erreur: PostgrestError): string {
  return [
    erreur.message,
    erreur.code ? `code ${erreur.code}` : null,
    erreur.details ? `détails : ${erreur.details}` : null,
    erreur.hint ? `piste : ${erreur.hint}` : null,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(' — ');
}

/**
 * Typée sur la table plutôt que sur `Record<string, unknown>` : un objet
 * générique satisferait le compilateur même avec des clés qu'`entitlements`
 * ne connaît pas, et `.update()` du SDK rejette précisément ce cas au
 * typage — l'intérêt du client généré serait perdu.
 */
type MiseAJourEntitlement =
  Database['public']['Tables']['entitlements']['Update'];

/**
 * L'échéance que l'événement repousse, ou `null` s'il ne la repousse pas.
 *
 * Une fin d'accès ne dit rien du plan, mais elle peut dire une échéance plus
 * lointaine — et `BILLING_ISSUE` est exactement ce cas. Il survient quand un
 * renouvellement échoue, donc au terme payé ou après : l'`expires_at` en base
 * est déjà passé, et `has_premium_access` exigeant `expires_at > now()`, le
 * compte perdait l'accès à la seconde où il entrait en période de grâce. Soit
 * l'inverse de la règle : « in_grace_period est un incident de facturation, pas
 * une fin d'abonnement ». L'événement porte la fin de la période de grâce dans
 * `expiration_at_ms`, il suffisait de la lire.
 *
 * L'échéance ne fait qu'avancer, jamais reculer. `CANCELLATION` et
 * `EXPIRATION` portent une échéance qui n'est pas postérieure à celle déjà
 * enregistrée : ils continuent donc de ne toucher qu'au statut. Et une échéance
 * nulle en base vaut l'infini — c'est un lifetime — donc rien ne la repousse.
 */
function echeanceProlongee(
  courante: string | null,
  evenement: Date | null,
): string | null {
  if (courante === null || evenement === null) return null;

  return new Date(courante) < evenement ? evenement.toISOString() : null;
}

/**
 * Droits d'accès (`entitlements`) : freemium / abonnement / lifetime.
 *
 * Source de vérité = cette table, alimentée par les webhooks RevenueCat.
 * Le SDK client ne sert qu'à l'affichage : jamais à autoriser une
 * fonctionnalité payante côté serveur.
 *
 * L'App User ID RevenueCat est l'UUID Supabase de l'utilisateur.
 */
@Injectable()
export class EntitlementsService {
  private readonly logger = new Logger(EntitlementsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Applique un événement RevenueCat sur la table `entitlements`.
   *
   * Idempotent, et par une comparaison d'horodatage plutôt que par un registre
   * d'identifiants d'événements : RevenueCat rejoue, mais il livre aussi dans
   * le désordre. Se contenter de « déjà vu ? » laisserait un `CANCELLATION`
   * arrivé en retard écraser un réabonnement déjà enregistré.
   *
   * La comparaison porte sur `last_event_at` et non sur `updated_at` : le
   * second date de notre écriture, pas de l'événement, donc un webhook lent
   * paraîtrait toujours périmé.
   *
   * N'insère jamais : la ligne est posée par le trigger `handle_new_user`. Un
   * App User ID sans profil est journalisé et ignoré — c'est un compte
   * supprimé, ou un événement d'un autre environnement RevenueCat.
   */
  async applyRevenueCatEvent(event: RevenueCatEvent): Promise<void> {
    const transition = transitionFor(event.type);

    if (!transition) {
      this.logger.log(
        `Événement RevenueCat ignoré, type inconnu : ${event.type}`,
      );
      return;
    }

    const { data: courante, error } = await this.supabase.client
      .from('entitlements')
      .select('plan, status, expires_at, last_event_at')
      .eq('profile_id', event.appUserId)
      .maybeSingle();

    if (error) {
      if (error.code === SYNTAXE_INVALIDE) {
        this.logger.warn(
          `Événement RevenueCat inexploitable pour ${event.appUserId} : ` +
            detaille(error),
        );
        return;
      }

      // Une vraie panne : remontée, pour que le contrôleur réponde 5xx et que
      // RevenueCat rejoue. C'est le seul cas où un rejeu sert à quelque chose.
      this.logger.error(
        `Lecture des droits de ${event.appUserId} échouée : ${detaille(error)}`,
      );
      throw error;
    }

    if (!courante) {
      this.logger.warn(
        `Événement RevenueCat pour un profil inconnu : ${event.appUserId}`,
      );
      return;
    }

    if (
      courante.last_event_at !== null &&
      // `>=` et non `>` : un rejeu exact (même horodatage) doit être ignoré.
      // Ça sacrifie aussi un événement distinct arrivé dans la même
      // milliseconde que le précédent — négligeable face à RevenueCat, dont
      // l'horodatage n'a de toute façon pas cette précision en pratique.
      new Date(courante.last_event_at) >= event.eventAt
    ) {
      this.logger.log(
        `Événement RevenueCat périmé ignoré pour ${event.appUserId} ` +
          `(${event.type} du ${event.eventAt.toISOString()})`,
      );
      return;
    }

    // Le plan n'est écrit que par une ouverture : une fin d'accès ne dit rien
    // du plan, et l'écraser réécrirait l'histoire du compte.
    const valeurs: MiseAJourEntitlement = {
      status: transition.status,
      last_event_at: event.eventAt.toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (transition.kind === 'grant') {
      valeurs.plan = transition.plan;
      valeurs.expires_at = event.expiresAt?.toISOString() ?? null;
      // Seul lien vers le souscripteur RevenueCat en cas de litige sur un
      // remboursement. Écrit seulement s'il est présent : un événement qui ne
      // le porte pas ne doit pas effacer une valeur déjà enregistrée.
      if (event.originalAppUserId !== null) {
        valeurs.revenuecat_id = event.originalAppUserId;
      }
    } else {
      const prolongee = echeanceProlongee(courante.expires_at, event.expiresAt);
      if (prolongee !== null) valeurs.expires_at = prolongee;
    }

    // La garde ci-dessus lit puis décide : entre cette lecture et l'écriture,
    // une autre livraison du même événement — ou un événement concurrent pour
    // le même profil — peut s'intercaler et passer la même garde. Rejouer le
    // filtre dans la clause du PATCH fait arbitrer par Postgres, pas par la
    // mémoire du process : la ligne la plus récente gagne toujours, même si sa
    // requête arrive en second.
    const { error: erreurEcriture } = await this.supabase.client
      .from('entitlements')
      .update(valeurs)
      .eq('profile_id', event.appUserId)
      .or(`last_event_at.is.null,last_event_at.lt.${event.eventAt.toISOString()}`);

    if (erreurEcriture) {
      if (erreurEcriture.code === SYNTAXE_INVALIDE) {
        this.logger.warn(
          `Écriture des droits de ${event.appUserId} impossible en l'état : ` +
            detaille(erreurEcriture),
        );
        return;
      }

      this.logger.error(
        `Écriture des droits de ${event.appUserId} échouée : ` +
          detaille(erreurEcriture),
      );
      throw erreurEcriture;
    }

    this.logger.log(
      `Droits de ${event.appUserId} mis à jour par ${event.type} : ` +
        `${JSON.stringify(valeurs)}`,
    );
  }
}
