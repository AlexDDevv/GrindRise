import { Injectable, Logger } from '@nestjs/common';

import {
  GamificationService,
  type WorkoutAward,
} from '../gamification/gamification.service';
import {
  NarrativeService,
  type NarrativeBeat,
} from '../narrative/narrative.service';
import { NotificationsService } from '../notifications/notifications.service';
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
  /**
   * Ce que la séance a ouvert côté narratif.
   *
   * Séparé de `award`, qui ne parle que d'XP : les deux se rééquilibrent
   * indépendamment, et un fragment débloqué n'est pas un gain chiffré.
   *
   * Toujours vide si la synchronisation a échoué — elle est best-effort, donc
   * l'absence de fragment ici ne prouve pas qu'aucun n'a été franchi. Le codex
   * reste la source de vérité, ce champ n'est qu'une occasion de l'annoncer au
   * bon moment.
   */
  narrative: {
    unlocked: NarrativeBeat[];
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
  private readonly logger = new Logger(WorkoutsService.name);

  constructor(
    private readonly users: UsersService,
    private readonly gamification: GamificationService,
    private readonly narrative: NarrativeService,
    private readonly notifications: NotificationsService,
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

    // Une séance change les deux sources de déclenchement narratif : le compte
    // de séances du sport, et le niveau global via l'XP qu'elle rapporte.
    //
    // Best-effort assumé : le déblocage ne fait pas partie de la transaction et
    // son échec ne doit pas perdre une séance déjà enregistrée. Le rattrapage
    // n'est pas laissé au hasard pour autant — `getState` resynchronise à
    // chaque consultation du codex, donc un déblocage manqué revient tout seul.
    let unlocked: NarrativeBeat[] = [];

    try {
      unlocked = await this.narrative.syncUnlocks(
        profileId,
        award.progress.level,
      );
    } catch (error) {
      this.logger.warn(
        `Synchronisation narrative échouée pour ${profileId} : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Après le narratif et hors de la transaction : même raisonnement que
    // syncUnlocks. L'XP est déjà créditée, et remonter une panne de
    // notification en 500 ferait ressaisir une séance qui serait alors refusée
    // comme trop rapprochée. Un email manqué est sans gravité, une séance
    // perdue non.
    if (award.levelAfter > award.levelBefore) {
      try {
        await this.notifications.enqueueLevelUp(profileId, {
          username: profile.username,
          levelBefore: award.levelBefore,
          levelAfter: award.levelAfter,
        });
      } catch (error) {
        this.logger.warn(
          `Notification de palier non produite pour ${profileId} : ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

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
      narrative: { unlocked },
    };
  }
}
