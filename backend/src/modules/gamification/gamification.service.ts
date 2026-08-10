import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Calcul d'XP, niveaux et règles anti-triche.
 *
 * Invariants à ne jamais casser :
 * - le client n'envoie JAMAIS de montant d'XP ; il envoie un `workout_log`,
 *   et c'est ce service qui en déduit l'XP selon les règles métier ;
 * - `xp_events` est append-only et n'est écrit qu'ici (clé `service_role`) ;
 * - `user_progress` est un cache dénormalisé, toujours recalculable à partir
 *   de `xp_events` ;
 * - la courbe de niveaux vient de la table `level_thresholds`, pas d'une
 *   formule en dur — le game design se rééquilibre sans redéploiement.
 *
 * À l'implémentation : injecter `SupabaseService` (module global).
 */
@Injectable()
export class GamificationService {
  /**
   * Attribue l'XP correspondant à une séance qui vient d'être enregistrée.
   * Doit être idempotent par `workoutLogId` (rejouer un log ne doit pas
   * créditer deux fois).
   */
  awardXpForWorkout(_profileId: string, _workoutLogId: string): Promise<void> {
    throw new NotImplementedException('GamificationService.awardXpForWorkout');
  }

  /** Recalcule `user_progress` à partir du log `xp_events`. */
  recomputeProgress(_profileId: string): Promise<void> {
    throw new NotImplementedException('GamificationService.recomputeProgress');
  }
}
