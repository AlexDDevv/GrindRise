import type { SessionExerciseInput } from '../strength/types';
import type { Program, ProgramExercise, ProgramWorkout } from './types';

/**
 * Lectures d'un programme, en fonctions pures.
 *
 * Ce que le serveur imbrique arrive avec des trous : un tableau nul quand la
 * relation est vide, un exercice nul quand il a quitté le catalogue. Chaque
 * écran qui referait ces vérifications à la main finirait par en oublier une,
 * et un `undefined` traversant un `.length` casse l'écran entier.
 *
 * Aucune ne touche React ni le réseau : ce sont elles qui décident ce que
 * l'utilisateur lit, donc elles se testent seules.
 */

/** Les jours d'un programme, dans l'ordre du serveur, jamais `undefined`. */
export function workoutsOf(program: Program): ProgramWorkout[] {
  return program.program_workouts ?? [];
}

/**
 * Les lignes d'un jour, ordonnées, celles dont l'exercice a disparu exclues.
 *
 * Le tri est refait ici bien que le serveur l'assure : c'est une garantie
 * gratuite, et elle évite qu'un jour s'affiche dans le désordre le jour où la
 * lecture change de forme.
 *
 * Les lignes et non les exercices : l'écran du jour type a besoin de leur
 * identifiant propre comme clé de liste. Le même mouvement peut figurer deux
 * fois dans un jour, donc `exercise_id` ne distingue pas deux lignes — et une
 * clé tirée du rang changerait à chaque déplacement, ce qui démonterait la
 * ligne qu'on est justement en train de glisser.
 */
export function orderedEntries(workout: ProgramWorkout): ProgramExercise[] {
  return (workout.program_workout_exercises ?? [])
    .slice()
    .sort((a, b) => a.order_index - b.order_index)
    .filter((entry) => entry.exercises !== null);
}

/** Les mêmes, sous la forme que la séance attend. */
export function exercisesOf(workout: ProgramWorkout): SessionExerciseInput[] {
  return orderedEntries(workout).map(toInput);
}

/** Une ligne de jour type vers l'exercice que la séance ajoutera. */
export function toInput(entry: ProgramExercise): SessionExerciseInput {
  // Non nul par construction : `orderedEntries` a écarté les lignes orphelines.
  const exercise = entry.exercises as NonNullable<ProgramExercise['exercises']>;

  return {
    exerciseId: exercise.id,
    name: exercise.name,
    muscleGroup: exercise.muscle_group,
  };
}

/**
 * Combien d'exercices ce jour porte — pour « 5 EXERCICES ».
 *
 * Compte les lignes de la relation et non `exercisesOf`, exercice disparu
 * compris : la ligne existe, elle occupe un rang, et annoncer quatre exercices
 * pour un jour qui en aligne cinq serait plus troublant que l'inverse.
 */
export function exerciseCount(workout: ProgramWorkout): number {
  return (workout.program_workout_exercises ?? []).length;
}

/** « 5 EXERCICES », « 1 EXERCICE », « AUCUN EXERCICE ». */
export function exerciseCountLabel(workout: ProgramWorkout): string {
  const count = exerciseCount(workout);

  if (count === 0) return 'AUCUN EXERCICE';

  return `${count} EXERCICE${count > 1 ? 'S' : ''}`;
}

/** « 3 JOURS TYPES », « 1 JOUR TYPE », « AUCUN JOUR TYPE ». */
export function workoutCountLabel(program: Program): string {
  const count = workoutsOf(program).length;

  if (count === 0) return 'AUCUN JOUR TYPE';

  return `${count} JOUR${count > 1 ? 'S' : ''} TYPE${count > 1 ? 'S' : ''}`;
}

/** « 2 PROGRAMMES » sur la carte de départ. */
export function programCountLabel(programs: Program[]): string {
  const count = programs.length;

  if (count === 0) return 'AUCUN PROGRAMME';

  return `${count} PROGRAMME${count > 1 ? 'S' : ''}`;
}

/**
 * Où se trouve un jour, programme compris — pour l'afficher hors de sa liste.
 *
 * L'écran de séance et la carte de départ nomment un jour type sans avoir son
 * programme sous la main : « Jour Pull » seul ne dit pas d'où il vient.
 */
export function locate(
  programs: Program[],
  workoutId: string,
): { program: Program; workout: ProgramWorkout } | null {
  for (const program of programs) {
    for (const workout of workoutsOf(program)) {
      if (workout.id === workoutId) return { program, workout };
    }
  }

  return null;
}

/** « Push Pull Legs · Jour Pull ». */
export function fullName(program: Program, workout: ProgramWorkout): string {
  return `${program.name} · ${workout.name}`;
}

/**
 * Ce que la suppression d'un programme emporte, dit en toutes lettres.
 *
 * La modale de confirmation doit énoncer exactement ce qui disparaît — c'est la
 * consigne du design, et c'est la seule chose qui distingue une confirmation
 * utile d'un « Êtes-vous sûr ? ». Les séances déjà enregistrées, elles, restent :
 * `workout_logs.program_workout_id` est en `on delete set null`.
 */
export function deletionWarning(program: Program): string {
  const count = workoutsOf(program).length;

  // Le singulier ne se fabrique pas en accordant le pluriel : « Ses 1 jour
  // type » n'est pas du français, et le déterminant change avec le nombre.
  const jours =
    count === 0
      ? "Il n'a aucun jour type."
      : count === 1
        ? 'Son jour type part avec lui.'
        : `Ses ${count} jours types partent avec lui.`;

  return `${jours} Les séances déjà enregistrées restent dans ton historique.`;
}
