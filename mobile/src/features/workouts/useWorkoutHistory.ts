import { useCallback, useEffect, useRef, useState } from 'react';

import { useUserStore } from '../../store/userStore';
import { readWorkouts, type LoggedWorkout } from './workoutFeed';

/**
 * L'historique complet, par pages, filtrable par sport.
 *
 * **Par pages et non d'un bloc** : rien ne borne le nombre de séances d'un
 * joueur assidu, et une lecture unique ramènerait des années de lignes avec
 * leurs exercices imbriqués pour n'en afficher qu'une dizaine.
 *
 * **Le filtre repart de la première page**, et c'est voulu : filtrer sur
 * « course » après avoir déroulé six pages de musculation n'a aucune raison de
 * conserver une position qui ne veut plus rien dire.
 *
 * Pas de `useFocusEffect` ici, contrairement à `useRecentWorkouts` : recharger
 * au retour rembobinerait la pagination et ramènerait l'utilisateur en haut
 * d'une liste qu'il venait de dérouler. Une séance enregistrée pendant qu'on
 * consulte son historique est un cas de bord, et le tirer-pour-rafraîchir le
 * couvre.
 */

/** Une page pleine tient plus d'un écran, sans faire attendre au premier rendu. */
const PAGE_SIZE = 20;

export function useWorkoutHistory(sportId: string | null) {
  const profileId = useUserStore((s) => s.session?.user.id ?? null);

  const [workouts, setWorkouts] = useState<LoggedWorkout[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  /** Faux dès qu'une page revient incomplète : il n'y a plus rien derrière. */
  const [hasMore, setHasMore] = useState(true);

  /**
   * Numéro de la dernière lecture demandée.
   *
   * Changer de sport pendant qu'une page est en vol ferait écrire la réponse
   * de l'ancien filtre par-dessus le nouveau. Seule la dernière lecture
   * demandée a le droit d'écrire.
   */
  const requestId = useRef(0);

  const loadFirstPage = useCallback(async () => {
    if (!profileId) return;

    const id = (requestId.current += 1);

    setError(null);
    setWorkouts(null);
    setHasMore(true);

    try {
      const page = await readWorkouts(profileId, { limit: PAGE_SIZE, sportId });
      if (id !== requestId.current) return;

      setWorkouts(page.workouts);
      setError(page.xpWarning);
      setHasMore(page.workouts.length === PAGE_SIZE);
    } catch (cause) {
      if (id !== requestId.current) return;

      setError(cause instanceof Error ? cause.message : 'Impossible de charger tes séances.');
    }
  }, [profileId, sportId]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    // `workouts` nul veut dire que la première page est encore en vol : la
    // suivante n'aurait aucun curseur d'où partir.
    if (!profileId || workouts === null || workouts.length === 0) return;
    if (!hasMore || isLoadingMore) return;

    const id = requestId.current;
    setIsLoadingMore(true);

    try {
      const page = await readWorkouts(profileId, {
        limit: PAGE_SIZE,
        before: workouts[workouts.length - 1].log.performed_at,
        sportId,
      });

      if (id !== requestId.current) return;

      setWorkouts((current) => [...(current ?? []), ...page.workouts]);
      setHasMore(page.workouts.length === PAGE_SIZE);
    } catch (cause) {
      if (id !== requestId.current) return;

      // La page suivante a échoué : celles déjà lues restent à l'écran, et le
      // message dit ce qui manque plutôt que de vider la liste.
      setError(cause instanceof Error ? cause.message : 'Impossible de charger la suite.');
    } finally {
      if (id === requestId.current) setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, profileId, sportId, workouts]);

  return {
    workouts,
    error,
    hasMore,
    isLoadingMore,
    loadMore,
    reload: loadFirstPage,
  };
}
