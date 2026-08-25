import { create } from 'zustand';

import * as session from './sessionState';
import type { SessionExerciseInput, SessionState, SetDraft } from './types';

/**
 * Séance de musculation en cours de saisie.
 *
 * Un store et non un `useReducer` dans l'écran : le catalogue est un écran de la
 * pile, pas une modale interne, et il doit ajouter un exercice à une séance qui
 * vit derrière lui. Faire voyager ça en route params vieillit mal dès qu'un
 * troisième écran s'en mêle. `onboardingStore` porte déjà exactement ce patron.
 *
 * **Ce fichier ne décide de rien.** Chaque action délègue à une fonction pure de
 * `sessionState.ts`, testée à part. La seule chose qu'il apporte en propre est
 * la clé locale d'un exercice : la tirer ici garde le réducteur pur.
 *
 * L'état ne survit pas à la fermeture de l'app, et c'est voulu : une séance à
 * moitié saisie retrouvée trois jours plus tard porterait un `startedAt` faux et
 * un contenu dont personne ne se souvient.
 */

type StrengthSessionStore = {
  session: SessionState;
  /** @param startedAt injectable pour les tests ; `Date.now()` par défaut. */
  start: (startedAt?: number) => void;
  reset: () => void;
  addExercise: (input: SessionExerciseInput) => void;
  removeExercise: (key: string) => void;
  moveExercise: (from: number, to: number) => void;
  toggleCollapsed: (key: string) => void;
  setReordering: (reordering: boolean) => void;
  addSet: (key: string, set: SetDraft) => void;
  updateSet: (key: string, index: number, set: SetDraft) => void;
  removeSet: (key: string, index: number) => void;
  setDurationOverride: (minutes: number) => void;
};

/**
 * Clé locale d'une carte.
 *
 * Un compteur monotone et non un UUID : la clé ne quitte jamais l'appareil — le
 * corps envoyé ne porte que `exerciseId` et l'ordre du tableau. Elle doit
 * seulement être unique dans une séance, et le compteur le garantit sans
 * dépendance.
 */
let nextKey = 0;
const makeKey = (): string => {
  nextKey += 1;
  return `carte-${nextKey}`;
};

export const useStrengthSessionStore = create<StrengthSessionStore>((set) => ({
  session: session.createSession(Date.now()),

  start: (startedAt = Date.now()) => set({ session: session.createSession(startedAt) }),
  reset: () => set({ session: session.createSession(Date.now()) }),

  addExercise: (input) =>
    set((s) => ({ session: session.addExercise(s.session, input, makeKey()) })),
  removeExercise: (key) =>
    set((s) => ({ session: session.removeExercise(s.session, key) })),
  moveExercise: (from, to) =>
    set((s) => ({ session: session.moveExercise(s.session, from, to) })),
  toggleCollapsed: (key) =>
    set((s) => ({ session: session.toggleCollapsed(s.session, key) })),
  setReordering: (reordering) =>
    set((s) => ({ session: session.setReordering(s.session, reordering) })),

  addSet: (key, draft) => set((s) => ({ session: session.addSet(s.session, key, draft) })),
  updateSet: (key, index, draft) =>
    set((s) => ({ session: session.updateSet(s.session, key, index, draft) })),
  removeSet: (key, index) =>
    set((s) => ({ session: session.removeSet(s.session, key, index) })),

  setDurationOverride: (minutes) =>
    set((s) => ({ session: session.setDurationOverride(s.session, minutes) })),
}));
