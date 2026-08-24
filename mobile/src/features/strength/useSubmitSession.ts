import { useCallback, useState } from 'react';

import { ApiError, apiRequest } from '../../lib/api';
import { useUserStore } from '../../store/userStore';
import type { WorkoutCreated, WorkoutResult } from '../workouts/workoutApi';
import { useStrengthSessionStore } from './strengthSessionStore';
import { toWorkoutPayload } from './toWorkoutPayload';

/**
 * Envoie la séance en cours à `POST /workouts`.
 *
 * **L'état n'est jamais vidé sur erreur.** C'est le seul échec du parcours qui
 * coûte cher : la séance est en mémoire, et personne ne veut la ressaisir. Le
 * `reset` n'a lieu qu'après un succès, et l'écran garde le bouton pressable
 * avec le message dans son pied, hors défilement.
 *
 * Pas d'insertion Supabase directe : depuis la migration `workouts_server_only`,
 * la RLS ne l'autorise plus, et une séance écrite hors de l'API n'aurait jamais
 * d'XP.
 */
export function useSubmitSession() {
  const session = useStrengthSessionStore((s) => s.session);
  const reset = useStrengthSessionStore((s) => s.reset);
  const applyProgress = useUserStore((s) => s.setProgress);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (): Promise<WorkoutResult | null> => {
    setIsSubmitting(true);
    setError(null);

    try {
      const created = await apiRequest<WorkoutCreated>('/workouts', {
        method: 'POST',
        body: toWorkoutPayload(session, Date.now()),
      });

      // La progression renvoyée fait autorité : elle sort de la transaction qui
      // vient d'écrire l'XP, alors que le store porte l'état d'avant.
      applyProgress(created.progress);

      const result: WorkoutResult = {
        ...created.award,
        unlocked: created.narrative.unlocked,
        strength: created.strength,
      };

      // Vidé seulement maintenant : avant, une panne réseau aurait effacé une
      // séance que le serveur n'a jamais reçue.
      reset();

      return result;
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? cause.message
          : 'Impossible de joindre le serveur. Réessaie.';

      console.warn('[strength] enregistrement impossible :', message);
      setError(message);

      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [applyProgress, reset, session]);

  return { submit, isSubmitting, error };
}
