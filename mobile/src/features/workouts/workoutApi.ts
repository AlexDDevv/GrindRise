import type { Database } from '../../lib/database.types';
import type { Profile, Progress } from '../../store/userStore';
import type { NarrativeBeat } from '../narrative/narrativeState';

/**
 * Ce que `POST /workouts` renvoie.
 *
 * Déclaré ici et non partagé avec le backend : il n'existe **aucun contrat
 * commun** dans ce dépôt. Le seul `contract.ts` est celui du service de
 * notifications, sans rapport. La source de vérité reste
 * `backend/src/modules/workouts/workouts.service.ts` et `strength-log.ts` ; ce
 * fichier en est un miroir, et c'est le prix de deux toolchains disjointes sans
 * package partagé.
 */

export type WorkoutLog = Database['public']['Tables']['workout_logs']['Row'];

type Entitlement = Database['public']['Tables']['entitlements']['Row'];

/** Une série telle qu'elle sort de la base — d'où le `snake_case`. */
export type LoggedSetSnapshot = {
  type: 'reps' | 'time';
  reps: number | null;
  duration_seconds: number | null;
  /** Charge externe, ou lest additionnel quand `is_bodyweight` est vrai. */
  weight_kg: number | null;
  is_bodyweight: boolean;
};

export type LoggedExerciseSnapshot = {
  exercise_id: string;
  sets: LoggedSetSnapshot[];
};

export type ExerciseStats = {
  exerciseId: string;
  sets: number;
  reps: number;
  durationSeconds: number;
  tonnageKg: number;
  tonnagePartial: boolean;
};

export type StrengthStats = {
  totalSets: number;
  totalReps: number;
  totalDurationSeconds: number;
  tonnageKg: number;
  /**
   * Vrai dès qu'une série au poids du corps a dû être exclue — donc **toujours**
   * aujourd'hui : aucune source de poids de corps n'est branchée côté serveur.
   * L'écran doit traiter ce cas comme la norme, pas comme l'exception.
   */
  tonnagePartial: boolean;
  perExercise: ExerciseStats[];
};

export type WorkoutCreated = {
  profile: Profile;
  progress: Progress;
  /** Même forme que `GET /users/me` — voir `users.service.ts` côté backend. */
  entitlement: Pick<Entitlement, 'plan' | 'status' | 'expires_at'>;
  award: {
    workout: WorkoutLog;
    xpAwarded: number;
    breakdown: { attendance: number; effort: number; streak: number };
    levelBefore: number;
    levelAfter: number;
    leveledUp: boolean;
    cappedReason: 'daily_limit' | 'too_close' | null;
  };
  /**
   * Fragments que la séance vient d'ouvrir. Vide si rien n'a été franchi — mais
   * aussi si la synchronisation a échoué côté serveur, où elle est best-effort.
   * L'absence n'est donc pas une preuve, seulement une occasion manquée.
   */
  narrative: { unlocked: NarrativeBeat[] };
  /**
   * Ce que la séance contenait, pour les sports à log structuré. Nul pour tout
   * autre sport — le champ existe alors sans valeur, pour que le mobile n'ait
   * qu'un contrat à connaître.
   */
  strength: {
    exercises: LoggedExerciseSnapshot[];
    stats: StrengthStats;
  } | null;
};

/** Ce que l'écran affiche après une séance enregistrée. */
export type WorkoutResult = WorkoutCreated['award'] & {
  unlocked: NarrativeBeat[];
  strength: WorkoutCreated['strength'];
};
