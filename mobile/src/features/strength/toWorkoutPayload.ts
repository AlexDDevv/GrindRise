import { sessionDurationMin } from './sessionDuration';
import type { SessionState, SetDraft } from './types';

/**
 * Traduit une séance en cours vers le corps de `POST /workouts`.
 *
 * Deux règles gouvernent cette traduction, et elles viennent toutes deux du
 * serveur :
 *
 * — **un champ absent n'est pas un champ à zéro.** `weight_kg` nul en base
 *   décrit une traction sans lest ; envoyer `0` déclarerait une charge de zéro
 *   kilo, ce qui n'est pas la même chose ;
 * — **une série ne porte que ce qui va avec son type.** `LoggedSetShapeMatchesType`
 *   refuse un corps qui porterait `reps` et `durationSeconds` ensemble. L'union
 *   discriminée de `SetDraft` rend le cas inatteignable, et cette fonction ne
 *   fait que le refléter.
 *
 * `metrics` ne porte que `durationMin` : `WorkoutPayloadMatchesSport` refuse
 * toute autre métrique pour un sport à log structuré.
 */

/** Slug de `sports.id`. Le seul sport à log structuré aujourd'hui. */
export const STRENGTH_SPORT_ID = 'musculation';

/** Une série, telle que `LoggedSetDto` l'attend : les champs nuls sont omis. */
type LoggedSetBody = {
  type: 'reps' | 'time';
  reps?: number;
  durationSeconds?: number;
  weightKg?: number;
  isBodyweight?: boolean;
};

type LoggedExerciseBody = {
  exerciseId: string;
  sets: LoggedSetBody[];
};

export type CreateWorkoutBody = {
  sportId: typeof STRENGTH_SPORT_ID;
  /** ISO 8601 avec fuseau : le serveur le range dans un jour local. */
  performedAt: string;
  metrics: { durationMin: number };
  exercises: LoggedExerciseBody[];
};

export function toWorkoutPayload(state: SessionState, now: number): CreateWorkoutBody {
  return {
    sportId: STRENGTH_SPORT_ID,
    performedAt: new Date(now).toISOString(),
    metrics: { durationMin: sessionDurationMin(state, now) },
    // L'ordre du tableau devient `order_index` : la RPC le lit par position.
    exercises: state.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      sets: exercise.sets.map(toSetBody),
    })),
  };
}

function toSetBody(set: SetDraft): LoggedSetBody {
  const body: LoggedSetBody = { type: set.type };

  if (set.type === 'reps') {
    body.reps = set.reps;
  } else {
    body.durationSeconds = set.durationSeconds;
  }

  // Omis et non à zéro : voir l'en-tête de fichier.
  if (set.weightKg !== null) body.weightKg = set.weightKg;
  if (set.isBodyweight) body.isBodyweight = true;

  return body;
}
