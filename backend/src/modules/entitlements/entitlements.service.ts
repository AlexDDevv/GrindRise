import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Droits d'accès (`entitlements`) : freemium / abonnement / lifetime.
 *
 * Source de vérité = cette table, alimentée par les webhooks RevenueCat.
 * Le SDK client ne sert qu'à l'affichage : jamais à autoriser une
 * fonctionnalité payante côté serveur.
 *
 * L'App User ID RevenueCat est l'UUID Supabase de l'utilisateur.
 *
 * À l'implémentation : injecter `SupabaseService` (module global).
 */
@Injectable()
export class EntitlementsService {
  /**
   * Applique un événement RevenueCat sur la table `entitlements`.
   * Doit être idempotent : RevenueCat rejoue les webhooks en cas d'échec.
   */
  applyRevenueCatEvent(_event: unknown): Promise<void> {
    throw new NotImplementedException(
      'EntitlementsService.applyRevenueCatEvent',
    );
  }
}
