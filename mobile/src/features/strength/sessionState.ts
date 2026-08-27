import { clampDurationMin } from './sessionDuration';
import type {
  SessionExercise,
  SessionExerciseInput,
  SessionOrigin,
  SessionState,
  SetDraft,
} from './types';

/**
 * Transitions d'une séance en cours de saisie, en fonctions pures.
 *
 * Rien ici ne touche React, le store, ni le réseau : c'est la logique la plus
 * facile à casser sans s'en rendre compte, donc celle qui doit pouvoir être
 * éprouvée cas limite par cas limite. Le store de la feature n'est qu'une
 * coquille qui appelle ces fonctions.
 *
 * Des fonctions nommées plutôt qu'un `switch` sur des actions : chaque
 * transition se teste alors sans construire d'objet d'action, et l'appelant lit
 * ce qu'il fait plutôt qu'un identifiant de chaîne.
 *
 * Aucune fonction ne mute son argument. Une clé inconnue est ignorée plutôt que
 * de lever : ces transitions viennent de l'interface, où une carte peut avoir
 * disparu entre le rendu et le geste.
 */

/** `@ArrayMaxSize(30)` sur `CreateWorkoutDto.exercises`. */
export const MAX_EXERCISES = 30;

/** `@ArrayMaxSize(20)` sur `LoggedExerciseDto.sets`. */
export const MAX_SETS_PER_EXERCISE = 20;

export function createSession(startedAt: number): SessionState {
  return {
    exercises: [],
    origin: null,
    startedAt,
    durationOverrideMin: null,
    reordering: false,
  };
}

/**
 * Une séance préremplie par un jour type — maquette 10, écran ②′.
 *
 * Le jour type ne porte que l'ordre des exercices : aucune série, aucune cible.
 * La séance qui en naît est donc une séance ordinaire dont les cartes sont
 * déjà posées, et non un mode particulier — tout ce qui suit se saisit, se
 * réordonne et se supprime comme d'habitude. « Un jour type est un point de
 * départ, pas un contrat. »
 *
 * **Seule la première carte est dépliée.** Cinq cartes ouvertes sur un écran de
 * six cents points font défiler avant même d'avoir commencé, alors qu'on ne
 * saisit qu'un exercice à la fois. Les suivantes affichent « Aucune série » et
 * s'ouvrent d'un appui.
 *
 * @param keys une clé locale par exercice, fabriquée par l'appelant — même
 *   raison que pour `addExercise` : les tirer ici rendrait la fonction impure.
 */
export function createSessionFrom(
  startedAt: number,
  origin: SessionOrigin,
  inputs: readonly SessionExerciseInput[],
  keys: readonly string[],
): SessionState {
  // Borné comme un ajout à la main : un jour type est plafonné à 30 exercices
  // côté serveur, mais rien ne garantit que les deux plafonds resteront égaux.
  const retenus = inputs.slice(0, MAX_EXERCISES);

  const exercises: SessionExercise[] = retenus.map((input, index) => ({
    ...input,
    key: keys[index],
    sets: [],
    collapsed: index > 0,
  }));

  return { exercises, origin, startedAt, durationOverrideMin: null, reordering: false };
}

export function canAddExercise(state: SessionState): boolean {
  return state.exercises.length < MAX_EXERCISES;
}

/**
 * @param key clé locale, fabriquée par l'appelant. La générer ici rendrait
 *   cette fonction impure et forcerait ses tests à mocker le hasard.
 */
export function addExercise(
  state: SessionState,
  input: SessionExerciseInput,
  key: string,
): SessionState {
  if (!canAddExercise(state)) return state;

  const exercise: SessionExercise = { ...input, key, sets: [], collapsed: false };

  return { ...state, exercises: [...state.exercises, exercise] };
}

export function removeExercise(state: SessionState, key: string): SessionState {
  return { ...state, exercises: state.exercises.filter((e) => e.key !== key) };
}

export function moveExercise(
  state: SessionState,
  from: number,
  to: number,
): SessionState {
  const { length } = state.exercises;
  const horsBornes = (i: number) => i < 0 || i >= length;

  // Un index hors bornes vient d'un geste relâché en dehors de la liste :
  // ne rien faire vaut mieux que déplacer une carte au hasard, et `splice`
  // sur un index négatif en perdrait une.
  if (horsBornes(from) || horsBornes(to) || from === to) return state;

  const exercises = [...state.exercises];
  const [deplace] = exercises.splice(from, 1);
  exercises.splice(to, 0, deplace);

  return { ...state, exercises };
}

export function toggleCollapsed(state: SessionState, key: string): SessionState {
  return mapExercise(state, key, (e) => ({ ...e, collapsed: !e.collapsed }));
}

/**
 * Le mode replie l'affichage de toutes les cartes, mais ne touche pas à leur
 * `collapsed` : en sortir rend à chacune l'état que l'utilisateur lui avait
 * donné, au lieu de les rouvrir toutes.
 */
export function setReordering(state: SessionState, reordering: boolean): SessionState {
  return { ...state, reordering };
}

export function canAddSet(state: SessionState, key: string): boolean {
  const exercise = state.exercises.find((e) => e.key === key);

  return exercise !== undefined && exercise.sets.length < MAX_SETS_PER_EXERCISE;
}

export function addSet(state: SessionState, key: string, set: SetDraft): SessionState {
  if (!canAddSet(state, key)) return state;

  return mapExercise(state, key, (e) => ({ ...e, sets: [...e.sets, set] }));
}

export function updateSet(
  state: SessionState,
  key: string,
  index: number,
  set: SetDraft,
): SessionState {
  return mapExercise(state, key, (e) => ({
    ...e,
    sets: e.sets.map((existant, i) => (i === index ? set : existant)),
  }));
}

export function removeSet(
  state: SessionState,
  key: string,
  index: number,
): SessionState {
  return mapExercise(state, key, (e) => ({
    ...e,
    sets: e.sets.filter((_, i) => i !== index),
  }));
}

/** La dernière série saisie, qui alimente « reprendre la précédente ». */
export function lastSetOf(state: SessionState, key: string): SetDraft | null {
  const sets = state.exercises.find((e) => e.key === key)?.sets ?? [];

  return sets.length === 0 ? null : sets[sets.length - 1];
}

/**
 * Corrige la durée de la séance à la main.
 *
 * L'écrêtage a lieu ici et pas seulement au moment d'envoyer : la valeur
 * corrigée s'affiche dans l'en-tête dès qu'elle est posée, et une valeur
 * affichée doit être celle qui partira.
 */
export function setDurationOverride(state: SessionState, minutes: number): SessionState {
  return { ...state, durationOverrideMin: clampDurationMin(minutes) };
}

/**
 * Les exercices sans série, que `@ArrayNotEmpty` refuserait.
 *
 * Nommés et non comptés : l'écran les cite dans son message d'erreur. Un
 * exercice ajouté puis oublié se corrige quand on le nomme ; retiré en silence,
 * il ne se remarque pas.
 */
export function emptyExerciseNames(state: SessionState): string[] {
  return state.exercises.filter((e) => e.sets.length === 0).map((e) => e.name);
}

function mapExercise(
  state: SessionState,
  key: string,
  change: (exercise: SessionExercise) => SessionExercise,
): SessionState {
  return {
    ...state,
    exercises: state.exercises.map((e) => (e.key === key ? change(e) : e)),
  };
}
