import { Injectable } from '@nestjs/common';

import {
  GamificationService,
  type WorkoutAward,
} from '../gamification/gamification.service';
// Import de type seul, donc effacé à la compilation : aucune dépendance à
// l'exécution, et la règle « aucun module n'importe les providers internes d'un
// autre » reste tenue. Réutiliser la forme de `GET /users/me` évite au mobile
// d'avoir deux contrats à connaître pour rafraîchir son store.
import type { UserWithProgress } from '../users/users.service';
import { UsersService } from '../users/users.service';
import type { CreateWorkoutDto } from './dto/create-workout.dto';

/**
 * Réponse de `POST /workouts`.
 *
 * `progress` n'est plus nullable ici, contrairement à `UserWithProgress` : la
 * ligne vient d'être écrite par la transaction, l'absence est devenue
 * impossible. La laisser nullable forcerait le mobile à une branche morte.
 */
export type WorkoutCreated = Omit<UserWithProgress, 'progress'> & {
  progress: WorkoutAward['progress'];
  /** Ce que la séance a rapporté — invisible dans `{ profile, progress }`. */
  award: {
    workout: WorkoutAward['workout'];
    xpAwarded: number;
    breakdown: WorkoutAward['breakdown'];
    levelBefore: number;
    levelAfter: number;
    leveledUp: boolean;
    cappedReason: WorkoutAward['cappedReason'];
  };
};

/**
 * Séances d'entraînement (`workout_logs`).
 *
 * Depuis la migration `workouts_server_only`, la RLS n'autorise plus le mobile
 * à insérer une séance : ce service est le seul chemin d'écriture. Une séance
 * insérée hors de lui n'aurait jamais d'XP mais compterait quand même pour le
 * streak, ce qui suffisait à contourner tout le modèle anti-triche.
 */
@Injectable()
export class WorkoutsService {
  constructor(
    private readonly users: UsersService,
    private readonly gamification: GamificationService,
  ) {}

  /**
   * Enregistre une séance et renvoie le contexte utilisateur à jour.
   *
   * @param profileId identité issue du JWT vérifié, jamais du corps de requête.
   */
  async createWorkoutLog(
    profileId: string,
    input: CreateWorkoutDto,
  ): Promise<WorkoutCreated> {
    // Lu avant l'écriture pour deux raisons : le fuseau décide du jour local de
    // la séance, et le niveau d'avant est la seule façon de savoir qu'un palier
    // a été franchi une fois la progression écrasée.
    const { profile, progress } = await this.users.getProfile(profileId);

    const award = await this.gamification.awardXpForWorkout(profileId, {
      sportId: input.sportId,
      performedAt: new Date(input.performedAt),
      metrics: input.metrics ?? {},
      timeZone: profile.timezone,
      levelBefore: progress?.level ?? 1,
    });

    return {
      profile,
      progress: award.progress,
      award: {
        workout: award.workout,
        xpAwarded: award.xpAwarded,
        breakdown: award.breakdown,
        levelBefore: award.levelBefore,
        levelAfter: award.levelAfter,
        leveledUp: award.levelAfter > award.levelBefore,
        cappedReason: award.cappedReason,
      },
    };
  }
}
