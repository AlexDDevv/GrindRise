import type { Database } from '../../lib/database.types';
import type { Exercise } from '../strength/useExerciseCatalog';

/**
 * Un programme, ses jours types, et l'ordre de leurs exercices.
 *
 * Les trois niveaux arrivent en une seule lecture : `GET /programs` imbrique
 * `program_workouts` puis `program_workout_exercises`, exercices compris. C'est
 * ce qui permet à l'écran des programmes d'afficher « 5 exercices » par jour
 * sans une requête par ligne, et au jour type de s'ouvrir sans rien recharger.
 *
 * Les noms de champs restent ceux de Postgres — `order_index`, `program_id` —
 * parce que ces objets viennent tels quels de PostgREST. Les convertir en
 * `camelCase` demanderait une couche de traduction pour un gain nul : rien
 * d'autre que cette feature ne les lit.
 */

type ProgramRow = Database['public']['Tables']['programs']['Row'];
type ProgramWorkoutRow = Database['public']['Tables']['program_workouts']['Row'];
type ProgramWorkoutExerciseRow =
  Database['public']['Tables']['program_workout_exercises']['Row'];

/** Un exercice à sa place dans un jour type, avec le catalogue joint. */
export type ProgramExercise = ProgramWorkoutExerciseRow & {
  /**
   * Nul si l'exercice a disparu du catalogue depuis. La jointure est nommée
   * d'après la table, c'est PostgREST qui le décide.
   */
  exercises: Exercise | null;
};

export type ProgramWorkout = ProgramWorkoutRow & {
  program_workout_exercises?: ProgramExercise[] | null;
};

export type Program = ProgramRow & {
  program_workouts?: ProgramWorkout[] | null;
};

/** `programs_name_length` et `@Length(1, 80)` sur les DTO. */
export const NAME_MAX = 80;
export const NAME_MIN = 1;

/** `@ArrayMaxSize(30)` sur `ReplaceExercisesDto`, et le plafond d'une séance. */
export const MAX_EXERCISES_PER_WORKOUT = 30;
