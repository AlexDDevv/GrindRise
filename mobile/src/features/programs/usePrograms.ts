import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { ApiError } from '../../lib/api';
import * as api from './programsApi';
import type { Program } from './types';

/**
 * Les programmes de l'appelant, et les sept écritures qui les modifient.
 *
 * Une seule lecture sert les trois écrans : `GET /programs` imbrique les jours
 * et leurs exercices, donc l'écran de départ compte les programmes, la liste
 * les déplie, et le jour type s'ouvre sans rien recharger.
 *
 * **Chaque écriture est suivie d'une relecture.** Recalculer l'arbre en mémoire
 * après un ajout de jour supposerait de refaire le rang contigu que le serveur
 * attribue, c'est-à-dire de dupliquer sa règle — et de la voir diverger au
 * premier cas limite. La liste est petite, la relecture est le prix juste.
 * L'exception est le réordonnancement des exercices, qui se joue au doigt et ne
 * peut pas attendre un aller-retour : voir `reorderExercises`.
 *
 * Rechargé à chaque retour sur l'écran : un jour ajouté depuis la pile doit
 * apparaître au retour, et rien ne met ce cache en commun entre les écrans.
 */
export function usePrograms() {
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Une écriture est en vol : les boutons qui la relanceraient s'éteignent. */
  const [isBusy, setIsBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);

    try {
      setPrograms(await api.listPrograms());
    } catch (cause) {
      console.warn('[programmes] lecture impossible :', messageOf(cause));
      setError(messageOf(cause));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /**
   * Joue une écriture, puis relit.
   *
   * @returns ce que l'écriture a produit, ou `null` si elle a échoué.
   *   L'appelant ferme sa feuille sur un succès et la laisse ouverte avec son
   *   message sinon — un nom refusé se corrige en deux caractères, pas en tout
   *   retapant. Le résultat lui-même sert à enchaîner : le design veut que
   *   créer un programme ouvre l'ajout de son premier jour, et ajouter un jour
   *   ouvre son catalogue, ce qui demande l'objet créé et pas seulement un
   *   succès.
   */
  const run = useCallback(
    async <T,>(write: () => Promise<T>): Promise<T | null> => {
      setIsBusy(true);
      setWriteError(null);

      try {
        const created = await write();
        await load();

        return created;
      } catch (cause) {
        console.warn('[programmes] écriture refusée :', messageOf(cause));
        setWriteError(messageOf(cause));

        return null;
      } finally {
        setIsBusy(false);
      }
    },
    [load],
  );

  /**
   * Réordonne les exercices d'un jour : l'affichage d'abord, le serveur ensuite.
   *
   * Le seul endroit qui n'attend pas la relecture. Le design pose que l'ordre
   * s'enregistre au glisser, sans rien à valider ; faire revenir la liste du
   * serveur entre deux déplacements la ferait sauter sous le doigt.
   *
   * En cas d'échec, la relecture remet l'ordre du serveur — l'utilisateur voit
   * son déplacement défait, ce qui est la vérité, et le message le dit.
   */
  const reorderExercises = useCallback(
    async (workoutId: string, exerciseIds: string[], optimistic: Program[]) => {
      setPrograms(optimistic);
      setWriteError(null);

      try {
        await api.replaceExercises(workoutId, exerciseIds);
      } catch (cause) {
        console.warn('[programmes] ordre refusé :', messageOf(cause));
        setWriteError(messageOf(cause));
        await load();
      }
    },
    [load],
  );

  return {
    programs,
    error,
    reload: load,
    isBusy,
    writeError,
    clearWriteError: useCallback(() => setWriteError(null), []),

    /** @returns le programme créé, ou `null` — l'appelant enchaîne dessus. */
    createProgram: useCallback(
      (name: string) => run(() => api.createProgram(name)),
      [run],
    ),
    renameProgram: useCallback(
      (id: string, name: string) => run(() => api.renameProgram(id, name)),
      [run],
    ),
    /** @returns le jour créé, ou `null` — l'appelant ouvre son catalogue. */
    addWorkout: useCallback(
      (programId: string, name: string) => run(() => api.addWorkout(programId, name)),
      [run],
    ),
    renameWorkout: useCallback(
      (id: string, name: string) => run(() => api.renameWorkout(id, name)),
      [run],
    ),

    // Les suppressions ne rendent rien : `run` rendrait `undefined`, qu'on ne
    // saurait pas distinguer d'un échec. Elles rendent donc un booléen.
    deleteProgram: useCallback(
      (id: string) => run(() => api.deleteProgram(id).then(() => true)),
      [run],
    ),
    deleteWorkout: useCallback(
      (id: string) => run(() => api.deleteWorkout(id).then(() => true)),
      [run],
    ),
    replaceExercises: useCallback(
      (workoutId: string, exerciseIds: string[]) =>
        run(() => api.replaceExercises(workoutId, exerciseIds).then(() => true)),
      [run],
    ),
    reorderExercises,
  };
}

function messageOf(cause: unknown): string {
  return cause instanceof ApiError
    ? cause.message
    : 'Impossible de joindre le serveur. Réessaie.';
}
