import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { Database } from '../../database.types';
import { SupabaseService } from '../../supabase/supabase.service';
import type { LoggedExerciseSnapshot } from '../workouts/strength-log';
import {
  localDayBounds,
  resolveTimeZone,
  toLocalDay,
  type LocalDay,
} from './local-day';
import {
  computeStreak,
  computeWorkoutXp,
  isWithinBacklogWindow,
  levelForXp,
  missingMetricsFor,
  streakBonusFor,
  XP_RULES,
  type WorkoutMetrics,
} from './xp-rules';

type WorkoutLog = Database['public']['Tables']['workout_logs']['Row'];
type UserProgress = Database['public']['Tables']['user_progress']['Row'];

/**
 * Profondeur d'historique lue pour reconstituer un streak.
 *
 * Un streak plus long que ça serait tronqué — cas qui n'existera pas avant
 * plusieurs années d'assiduité parfaite, et qui ne fait que sous-estimer le
 * compteur, jamais l'inverse. Une borne explicite vaut mieux qu'une requête
 * dont le coût croît sans fin.
 */
const STREAK_HISTORY_DAYS = 400;

/**
 * SQLSTATE que nos fonctions Postgres lèvent pour une valeur de référence
 * inconnue — un sport qui n'existe pas, aujourd'hui.
 *
 * Contrat déclaré dans la migration `reject_unknown_sport` : la classe `GR0xx`
 * est réservée aux erreurs métier de nos fonctions, à traduire en 400. Sans ce
 * code, il faudrait soit relire `sports` avant chaque séance, soit reconnaître
 * une violation de clé étrangère dans un message d'erreur que Postgres ne
 * garantit pas.
 */
const INVALID_REFERENCE = 'GR001';

/** Exercice inexistant, ou appartenant à un autre profil. Faute du client. */
const INVALID_EXERCISE = 'GR002';

/**
 * Ressource appartenant à un autre profil.
 *
 * Traduit en 404 et non en 403 : répondre « interdit » confirmerait que
 * l'identifiant existe, et donnerait de quoi énumérer les programmes d'autrui.
 */
const FOREIGN_RESOURCE = 'GR003';

export type XpBreakdown = {
  /** Part de présence : versée dès qu'une séance est créditée. */
  attendance: number;
  /** Part d'effort, plafonnée et concave. */
  effort: number;
  /** Bonus de palier de streak, versé en événement distinct. */
  streak: number;
};

/** Pourquoi une séance n'a rien rapporté. Nul si elle a été créditée. */
export type CappedReason = 'daily_limit' | 'too_close';

export type WorkoutAward = {
  workout: WorkoutLog;
  progress: UserProgress;
  /** XP réellement inscrite au compte. Zéro si plafonnée ou déjà créditée. */
  xpAwarded: number;
  breakdown: XpBreakdown;
  levelBefore: number;
  levelAfter: number;
  cappedReason: CappedReason | null;
  /** Exercices tels que relus en base : vide pour un sport à log plat. */
  exercises: LoggedExerciseSnapshot[];
};

export type WorkoutInput = {
  sportId: string;
  performedAt: Date;
  metrics: WorkoutMetrics;
  /** Fuseau du profil : découpe l'instant en jour local. */
  timeZone: string | null;
  /** Niveau avant l'enregistrement, pour détecter le passage de palier. */
  levelBefore: number;
  /**
   * Séance structurée, déjà traduite en `snake_case` par l'appelant : ce
   * service ne connaît pas les DTO, il transmet une forme de base.
   */
  exercises?: LoggedExerciseSnapshot[] | null;
  programWorkoutId?: string | null;
};

type RpcResult = {
  workout: WorkoutLog;
  progress: UserProgress;
  xp_awarded: number;
  capped_reason: CappedReason | null;
  exercises: LoggedExerciseSnapshot[];
};

/**
 * Calcul d'XP, niveaux et règles anti-triche.
 *
 * Invariants à ne jamais casser :
 * - le client n'envoie JAMAIS de montant d'XP ; il envoie une séance, et c'est
 *   ce service qui en déduit l'XP selon les règles métier ;
 * - `xp_events` est append-only et n'est écrit qu'ici (clé `service_role`) ;
 * - `user_progress` est un cache dénormalisé, toujours recalculable à partir
 *   de `xp_events` — c'est ce que fait `recomputeProgress` ;
 * - la courbe de niveaux vient de la table `level_thresholds`, pas d'une
 *   formule en dur — le game design se rééquilibre sans redéploiement.
 *
 * Le barème lui-même n'est pas ici mais dans `xp-rules.ts`, en fonctions pures :
 * ce service ne fait que lire l'état, l'y soumettre, et écrire le résultat.
 */
@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Enregistre une séance et crédite son XP dans la même transaction.
   *
   * La signature initialement prévue (`awardXpForWorkout(profileId,
   * workoutLogId)`) supposait une séance déjà insérée. Elle n'est plus tenable :
   * insérer puis créditer en deux appels PostgREST laisserait, en cas
   * d'interruption, une séance sans XP — et `recomputeProgress` ne rattrape pas
   * ce cas, puisqu'il recalcule le cache à partir de `xp_events` sans pouvoir
   * inventer l'événement manquant. Les deux écritures partent donc ensemble,
   * par la RPC `log_workout_with_xp`.
   *
   * L'idempotence reste garantie par l'index unique partiel sur
   * `(profile_id, source_type, source_id)` : la RPC traite un conflit comme
   * « déjà crédité », pas comme une erreur.
   */
  async awardXpForWorkout(
    profileId: string,
    input: WorkoutInput,
  ): Promise<WorkoutAward> {
    const timeZone = resolveTimeZone(input.timeZone);
    const performedDay = toLocalDay(input.performedAt, timeZone);
    const today = toLocalDay(new Date(), timeZone);

    if (!isWithinBacklogWindow(performedDay, today)) {
      // Au-delà de la fenêtre, ce n'est plus un oubli : c'est un historique
      // fabriqué après coup pour récolter les paliers de streak.
      throw new BadRequestException(
        `Une séance ne peut être enregistrée que jusqu'à ${XP_RULES.maxBacklogDays} jours en arrière.`,
      );
    }

    const missing = missingMetricsFor(input.sportId, input.metrics);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Métriques manquantes pour ce sport : ${missing.join(', ')}.`,
      );
    }

    const history = await this.readWorkoutDays(profileId, timeZone);
    const streak = computeStreak(history, performedDay);
    const workoutXp = computeWorkoutXp(input.sportId, input.metrics);
    const streakXp = streakBonusFor(streak.before, streak.after);

    const { start, end } = localDayBounds(performedDay, timeZone);

    // Les montants partent calculés et les plafonds partent en valeurs : la
    // fonction Postgres apporte l'atomicité et la sérialisation, jamais une
    // règle de jeu. Elle reste donc lisible sans connaître le barème.
    const { data, error } = await this.supabase.client.rpc(
      'log_workout_with_xp',
      {
        p_profile_id: profileId,
        p_sport_id: input.sportId,
        p_performed_at: input.performedAt.toISOString(),
        p_metrics:
          input.metrics as Database['public']['Tables']['workout_logs']['Row']['metrics'],
        p_exercises: (input.exercises ??
          null) as unknown as Database['public']['Tables']['workout_logs']['Row']['metrics'],
        // Le type généré déclare `string`, non `string | null` : un écart entre
        // le générateur et la fonction SQL, qui elle accepte bien un `uuid`
        // nul (`p_program_workout_id is not null` dans la migration).
        p_program_workout_id: (input.programWorkoutId ??
          null) as unknown as string,
        p_workout_xp: workoutXp.total,
        p_streak_xp: streakXp,
        p_streak_days: streak.after,
        p_last_workout_on: streak.lastWorkoutOn,
        p_day_start: start.toISOString(),
        p_day_end: end.toISOString(),
        p_daily_credited_limit: XP_RULES.dailyCreditedWorkouts,
        p_min_gap_minutes: XP_RULES.minMinutesBetweenWorkouts,
      },
    );

    if (error) {
      if (error.code === INVALID_REFERENCE) {
        // Faute du client, pas panne du serveur : la fonction l'annonce
        // elle-même par son SQLSTATE, sans qu'on ait à lire un message.
        throw new BadRequestException(`Sport inconnu : ${input.sportId}.`);
      }

      if (error.code === INVALID_EXERCISE) {
        throw new BadRequestException(
          'Un des exercices est inconnu ou ne vous appartient pas.',
        );
      }

      if (error.code === FOREIGN_RESOURCE) {
        throw new NotFoundException('Ce jour de programme est introuvable.');
      }

      this.logger.error(
        `Enregistrement de séance échoué pour ${profileId} : ${error.message}`,
      );
      throw new InternalServerErrorException(
        "Impossible d'enregistrer la séance.",
      );
    }

    const result = data as unknown as RpcResult;
    const credited = result.capped_reason === null;

    return {
      workout: result.workout,
      progress: result.progress,
      xpAwarded: result.xp_awarded,
      // Le détail décrit ce qui a été versé, pas ce qui aurait pu l'être : une
      // séance plafonnée affiche des zéros, pas un gain fantôme.
      breakdown: {
        attendance: credited ? workoutXp.attendance : 0,
        effort: credited ? workoutXp.effort : 0,
        streak: credited ? streakXp : 0,
      },
      levelBefore: input.levelBefore,
      levelAfter: result.progress.level,
      cappedReason: result.capped_reason,
      exercises: result.exercises ?? [],
    };
  }

  /**
   * Recalcule `user_progress` à partir de `xp_events` et `workout_logs`.
   *
   * Rejouable à volonté et convergent : deux exécutions successives donnent le
   * même résultat, puisque rien n'est incrémenté — tout est resommé depuis les
   * sources. C'est le filet de sécurité d'un rééquilibrage de la courbe : en
   * modifiant `level_thresholds` puis en rejouant ceci, tous les niveaux se
   * réalignent sans toucher à un seul `xp_events`.
   */
  async recomputeProgress(profileId: string): Promise<UserProgress> {
    const [totalXp, thresholds, timeZone] = await Promise.all([
      this.readTotalXp(profileId),
      this.readThresholds(),
      this.readTimeZone(profileId),
    ]);

    const days = await this.readWorkoutDays(profileId, timeZone);
    const lastDay = days.length > 0 ? days[days.length - 1] : null;

    // `computeStreak` avec le dernier jour comme « nouveau » jour : l'ensemble
    // est inchangé, donc `after` est bien la chaîne courante.
    const streakDays = lastDay ? computeStreak(days, lastDay).after : 0;

    const { data, error } = await this.supabase.client
      .from('user_progress')
      .update({
        current_xp: totalXp,
        level: levelForXp(thresholds, totalXp),
        streak_days: streakDays,
        last_workout_on: lastDay,
        updated_at: new Date().toISOString(),
      })
      .eq('profile_id', profileId)
      // Exiger la ligne en retour : un UPDATE qui ne touche rien ne lève pas
      // d'erreur, il réussit à vide. « Pas d'erreur » ne vaut pas « écrit ».
      .select()
      .single();

    if (error) {
      this.logger.error(
        `Recalcul de progression échoué pour ${profileId} : ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Impossible de recalculer la progression.',
      );
    }

    return data;
  }

  /** Jours locaux portant au moins une séance, du plus ancien au plus récent. */
  private async readWorkoutDays(
    profileId: string,
    timeZone: string,
  ): Promise<LocalDay[]> {
    const since = new Date(Date.now() - STREAK_HISTORY_DAYS * 86_400_000);

    const { data, error } = await this.supabase.client
      .from('workout_logs')
      .select('performed_at')
      .eq('profile_id', profileId)
      .gte('performed_at', since.toISOString())
      .order('performed_at', { ascending: true });

    if (error) {
      this.logger.error(
        `Lecture de l'historique échouée pour ${profileId} : ${error.message}`,
      );
      throw new InternalServerErrorException(
        "Impossible de lire l'historique des séances.",
      );
    }

    // Dédoublonné : plusieurs séances dans la même journée ne comptent que pour
    // un jour de chaîne.
    const days = new Set(
      data.map((row) => toLocalDay(new Date(row.performed_at), timeZone)),
    );

    return [...days].sort();
  }

  private async readTotalXp(profileId: string): Promise<number> {
    const { data, error } = await this.supabase.client
      .from('xp_events')
      .select('amount')
      .eq('profile_id', profileId);

    if (error) {
      this.logger.error(
        `Lecture de l'XP échouée pour ${profileId} : ${error.message}`,
      );
      throw new InternalServerErrorException("Impossible de lire l'XP.");
    }

    return data.reduce((total, event) => total + event.amount, 0);
  }

  private async readThresholds(): Promise<
    { level: number; xp_required: number }[]
  > {
    const { data, error } = await this.supabase.client
      .from('level_thresholds')
      .select('level, xp_required');

    if (error) {
      this.logger.error(`Lecture de la courbe échouée : ${error.message}`);
      throw new InternalServerErrorException(
        'Impossible de lire la courbe de niveaux.',
      );
    }

    return data;
  }

  private async readTimeZone(profileId: string): Promise<string> {
    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('timezone')
      .eq('id', profileId)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `Lecture du fuseau échouée pour ${profileId} : ${error.message}`,
      );
      throw new InternalServerErrorException('Impossible de lire le profil.');
    }

    return resolveTimeZone(data?.timezone);
  }
}
