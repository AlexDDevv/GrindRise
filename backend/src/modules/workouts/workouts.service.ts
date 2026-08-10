import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Séances d'entraînement (`workout_logs`).
 *
 * Le mobile peut insérer un log directement via la RLS pour les cas simples ;
 * ce service existe pour le chemin « log + attribution d'XP » qui doit rester
 * côté serveur.
 *
 * À l'implémentation : injecter `SupabaseService` (module global) et
 * `GamificationService` (déjà importé par le module).
 */
@Injectable()
export class WorkoutsService {
  /**
   * Enregistre une séance puis délègue l'attribution d'XP à la gamification.
   * Les métriques sont stockées en `jsonb` (forme variable selon le sport).
   */
  createWorkoutLog(_profileId: string, _input: unknown): Promise<unknown> {
    throw new NotImplementedException('WorkoutsService.createWorkoutLog');
  }
}
