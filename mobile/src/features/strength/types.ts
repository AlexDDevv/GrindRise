import type { Database } from '../../lib/database.types';

export type MuscleGroup = Database['public']['Enums']['muscle_group'];

/**
 * Une série, telle qu'elle se saisit.
 *
 * Union discriminée et non objet à quatre champs optionnels : c'est le miroir
 * de la contrainte `logged_sets_shape_matches_type` et de son jumeau
 * `LoggedSetShapeMatchesType`. Une série qui porterait `reps` *et*
 * `durationSeconds` devient impossible à construire, donc le 400 correspondant
 * devient inatteignable — la règle du serveur est tenue par le compilateur, et
 * non vérifiée juste avant l'envoi.
 *
 * `weightKg` nul signifie « aucune charge », et se traduira par un champ omis
 * dans le corps envoyé — jamais par un zéro. Quand `isBodyweight` est vrai, la
 * valeur est un lest additionnel.
 */
export type SetDraft =
  | { type: 'reps'; reps: number; weightKg: number | null; isBodyweight: boolean }
  | {
      type: 'time';
      durationSeconds: number;
      weightKg: number | null;
      isBodyweight: boolean;
    };

/** Ce qu'il faut savoir d'un exercice du catalogue pour l'ajouter. */
export type SessionExerciseInput = {
  exerciseId: string;
  name: string;
  muscleGroup: MuscleGroup;
};

export type SessionExercise = SessionExerciseInput & {
  /**
   * Clé locale, distincte de `exerciseId`.
   *
   * L'unicité en base porte sur `(workout_log_id, order_index)` et non sur
   * l'exercice : le même mouvement peut légitimement figurer deux fois dans une
   * séance, et on y revient vraiment en fin d'entraînement. Se servir de
   * `exerciseId` comme clé de liste ferait alors fusionner deux cartes.
   */
  key: string;
  sets: SetDraft[];
  /** Repliée en résumé, par choix de l'utilisateur. */
  collapsed: boolean;
};

/**
 * Le jour type dont la séance est issue, quand elle n'est pas libre.
 *
 * Les deux noms voyagent avec l'identifiant plutôt que d'être relus au moment
 * d'afficher l'en-tête : le jour peut être renommé ou supprimé pendant la
 * séance, et l'en-tête doit continuer à nommer ce sur quoi l'utilisateur
 * s'entraîne. Seul `programWorkoutId` part au serveur.
 */
export type SessionOrigin = {
  programWorkoutId: string;
  programName: string;
  workoutName: string;
};

export type SessionState = {
  exercises: SessionExercise[];
  /** Jour type suivi, ou nul pour une séance libre. */
  origin: SessionOrigin | null;
  /** Départ du chrono, posé à l'ouverture de la séance. */
  startedAt: number;
  /**
   * Durée retenue en minutes, quand l'utilisateur a corrigé le chrono. Nulle
   * tant qu'il ne l'a pas fait : c'est alors l'écoulé depuis `startedAt` qui
   * fait foi. Deux champs plutôt qu'un seul remis à jour chaque seconde —
   * sinon une correction serait écrasée au tic suivant.
   */
  durationOverrideMin: number | null;
  /**
   * Mode réordonnancement. Il replie l'affichage de toutes les cartes sans
   * toucher à leur `collapsed`, pour qu'en sortir rende à chacune l'état que
   * l'utilisateur lui avait donné.
   */
  reordering: boolean;
};
