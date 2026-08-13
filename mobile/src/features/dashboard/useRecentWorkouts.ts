import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import type { Database } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../store/userStore';

type WorkoutLog = Database['public']['Tables']['workout_logs']['Row'];

/** Une séance et ce qu'elle a rapporté. */
export type RecentWorkout = {
  log: WorkoutLog;
  /** XP encaissée grâce à cette séance. Zéro si elle a été plafonnée. */
  xpGain: number;
};

/** Assez pour montrer un rythme, pas assez pour faire un historique. */
const RECENT_LIMIT = 5;

/**
 * Les dernières séances du joueur, avec leur gain.
 *
 * Lecture directe via la RLS (`workout_logs_select_own`, `xp_events_select_own`) :
 * ce sont ses propres lignes, exactement ce que les policies couvrent. L'API
 * n'entre en jeu que pour *écrire* une séance, parce que l'XP s'y calcule.
 *
 * Deux requêtes et non une jointure : `xp_events.source_id` n'a pas de clé
 * étrangère vers `workout_logs` — la colonne désigne l'objet à l'origine du
 * gain, quel que soit son type —, donc PostgREST ne sait pas les relier.
 *
 * Le gain somme tous les événements d'une séance, et pas seulement celui de type
 * `workout` : un palier de série est un `xp_events` distinct qui porte le même
 * `source_id`. Ne compter que le premier afficherait « +64 » sur une séance qui
 * a rapporté 89, sans que rien n'explique l'écart.
 *
 * Rechargé à chaque retour sur l'onglet : une séance loggée entre-temps doit
 * apparaître, et le store ne porte que la progression, pas l'historique.
 */
export function useRecentWorkouts() {
  const profileId = useUserStore((s) => s.session?.user.id ?? null);

  const [workouts, setWorkouts] = useState<RecentWorkout[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profileId) return;

    setError(null);

    const { data: logs, error: logsError } = await supabase
      .from('workout_logs')
      .select('*')
      .eq('profile_id', profileId)
      .order('performed_at', { ascending: false })
      .limit(RECENT_LIMIT);

    if (logsError) {
      console.warn('[dashboard] lecture des séances impossible :', logsError.message);
      setError('Impossible de charger tes dernières séances.');
      return;
    }

    if (logs.length === 0) {
      setWorkouts([]);
      return;
    }

    const { data: events, error: eventsError } = await supabase
      .from('xp_events')
      .select('source_id, amount')
      .in(
        'source_id',
        logs.map((log) => log.id),
      );

    if (eventsError) {
      // Les séances sont là, seuls les gains manquent : les afficher à zéro
      // serait un mensonge, ne rien afficher une régression. On garde les
      // séances et on signale l'incident.
      console.warn('[dashboard] lecture des gains impossible :', eventsError.message);
      setError('Les gains d’XP n’ont pas pu être relus.');
      setWorkouts(logs.map((log) => ({ log, xpGain: 0 })));
      return;
    }

    const gains = new Map<string, number>();
    for (const event of events) {
      if (!event.source_id) continue;
      gains.set(event.source_id, (gains.get(event.source_id) ?? 0) + event.amount);
    }

    setWorkouts(logs.map((log) => ({ log, xpGain: gains.get(log.id) ?? 0 })));
  }, [profileId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { workouts, error, reload: load };
}
