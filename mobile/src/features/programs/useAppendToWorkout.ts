import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '../../lib/api';
import { exerciseCount, locate } from './programState';
import { listPrograms, replaceExercises } from './programsApi';
import { MAX_EXERCISES_PER_WORKOUT } from './types';

/**
 * Ajoute un exercice à la fin d'un jour type, depuis le catalogue.
 *
 * Le catalogue sert deux destinations — la séance en cours, et un jour type
 * qu'on remplit — et c'est la route qui dit laquelle. Ce hook porte la seconde,
 * pour que l'écran n'ait pas à connaître la forme des programmes.
 *
 * **Il lit toute la liste pour un seul jour**, faute d'endpoint qui rende un
 * jour isolé. C'est le prix d'une modale ouverte quelques secondes, et la
 * lecture n'a lieu que lorsqu'un jour est visé : une séance libre ne déclenche
 * aucune requête ici.
 *
 * L'ajout est un remplacement de toute la liste, comme partout ailleurs : c'est
 * la seule écriture que le serveur expose, et elle garantit des rangs contigus.
 *
 * @param workoutId le jour à remplir, ou `null` pour une séance libre.
 */
export function useAppendToWorkout(workoutId: string | null) {
  const [exerciseIds, setExerciseIds] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (workoutId === null) return;

    let annule = false;

    void (async () => {
      try {
        const programs = await listPrograms();
        const found = locate(programs, workoutId);

        if (annule) return;

        // Un jour disparu laisse la liste nulle : `append` refusera, et le
        // message le dira plutôt que d'écrire dans le vide.
        setExerciseIds(
          found === null
            ? null
            : (found.workout.program_workout_exercises ?? [])
                .slice()
                .sort((a, b) => a.order_index - b.order_index)
                .map((entry) => entry.exercise_id),
        );

        if (found === null) setError("Ce jour type n'existe plus.");
        else if (exerciseCount(found.workout) >= MAX_EXERCISES_PER_WORKOUT) {
          setError(`Ce jour est complet : ${MAX_EXERCISES_PER_WORKOUT} exercices au maximum.`);
        }
      } catch (cause) {
        if (annule) return;

        console.warn('[programmes] jour illisible :', messageOf(cause));
        setError(messageOf(cause));
      }
    })();

    // Le catalogue se referme dès l'ajout : sans ce garde-fou, une réponse
    // arrivée après coup écrirait dans un composant démonté.
    return () => {
      annule = true;
    };
  }, [workoutId]);

  /** @returns vrai si l'exercice a bien été ajouté. */
  const append = useCallback(
    async (exerciseId: string): Promise<boolean> => {
      if (workoutId === null || exerciseIds === null) return false;

      if (exerciseIds.length >= MAX_EXERCISES_PER_WORKOUT) {
        setError(`Ce jour est complet : ${MAX_EXERCISES_PER_WORKOUT} exercices au maximum.`);
        return false;
      }

      setIsBusy(true);
      setError(null);

      const next = [...exerciseIds, exerciseId];

      try {
        await replaceExercises(workoutId, next);
        setExerciseIds(next);

        return true;
      } catch (cause) {
        console.warn('[programmes] ajout refusé :', messageOf(cause));
        setError(messageOf(cause));

        return false;
      } finally {
        setIsBusy(false);
      }
    },
    [exerciseIds, workoutId],
  );

  return { append, error, isBusy };
}

function messageOf(cause: unknown): string {
  return cause instanceof ApiError
    ? cause.message
    : 'Impossible de joindre le serveur. Réessaie.';
}
