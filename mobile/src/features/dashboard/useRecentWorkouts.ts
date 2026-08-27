import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { useUserStore } from '../../store/userStore';
import { readWorkouts, type LoggedWorkout } from '../workouts/workoutFeed';

/**
 * Les dernières séances du joueur, avec leur gain.
 *
 * La lecture elle-même vit dans `workoutFeed` : l'historique complet lit
 * exactement la même chose, à la page et au filtre près, et la dupliquer aurait
 * fait diverger deux fois la même jointure. Ce hook n'apporte que le cadrage —
 * combien, et quand recharger.
 *
 * Rechargé à chaque retour sur l'onglet : une séance loggée entre-temps doit
 * apparaître, et le store ne porte que la progression, pas l'historique.
 */

/** Assez pour montrer un rythme, pas assez pour faire un historique. */
const RECENT_LIMIT = 5;

export type RecentWorkout = LoggedWorkout;

export function useRecentWorkouts() {
  const profileId = useUserStore((s) => s.session?.user.id ?? null);

  const [workouts, setWorkouts] = useState<RecentWorkout[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profileId) return;

    setError(null);

    try {
      const page = await readWorkouts(profileId, { limit: RECENT_LIMIT });

      setWorkouts(page.workouts);
      setError(page.xpWarning);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de charger tes séances.');
    }
  }, [profileId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { workouts, error, reload: load };
}
