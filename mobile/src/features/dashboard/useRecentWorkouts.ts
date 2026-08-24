import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import type { Database } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../store/userStore';
import type { StrengthSummarySource } from '../workouts/workoutSummary';

type WorkoutLog = Database['public']['Tables']['workout_logs']['Row'];

/** Une séance et ce qu'elle a rapporté. */
export type RecentWorkout = {
  log: WorkoutLog;
  /** XP encaissée grâce à cette séance. Zéro si elle a été plafonnée. */
  xpGain: number;
  /**
   * De quoi résumer une séance à log structuré. Nul pour les autres sports, et
   * pour les séances de musculation antérieures à la refonte, qui n'ont aucune
   * ligne dans `logged_exercises`.
   */
  strength: StrengthSummarySource | null;
};

/** Ce que la jointure imbriquée ramène en plus de la séance. */
type LogWithExercises = WorkoutLog & {
  logged_exercises: { id: string; logged_sets: { id: string }[] }[] | null;
};

/** Ce que la séance a d'exercices et de séries, pour le résumé compact. */
function strengthOf(log: LogWithExercises): StrengthSummarySource | null {
  const exercises = log.logged_exercises ?? [];
  if (exercises.length === 0) return null;

  return {
    exerciseCount: exercises.length,
    setCount: exercises.reduce((total, e) => total + e.logged_sets.length, 0),
  };
}

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
      // Les exercices et leurs séries en une seule lecture : ils ont une clé
      // étrangère vers `workout_logs`, donc PostgREST sait les imbriquer — ce
      // que `xp_events` ne permet pas, d'où la seconde requête plus bas.
      //
      // Seuls les identifiants sont demandés : le résumé ne compte que des
      // lignes, et ramener charges et répétitions pour les jeter serait payer
      // un transfert pour rien.
      .select('*, logged_exercises(id, logged_sets(id))')
      .eq('profile_id', profileId)
      .order('performed_at', { ascending: false })
      .limit(RECENT_LIMIT);

    if (logsError) {
      console.warn('[dashboard] lecture des séances impossible :', logsError.message);
      setError('Impossible de charger tes dernières séances.');
      return;
    }

    // Les types générés par Supabase ne portent pas la forme d'un `select`
    // imbriqué (précédent : `ProgramsService.list`, backend). L'assertion en
    // deux temps est nécessaire ; la RLS (`logged_exercises_select_own`,
    // `logged_sets_select_own`) garantit que ces lignes appartiennent bien à
    // l'appelant.
    const nested = logs as unknown as LogWithExercises[];

    if (nested.length === 0) {
      setWorkouts([]);
      return;
    }

    const { data: events, error: eventsError } = await supabase
      .from('xp_events')
      .select('source_id, amount')
      .in(
        'source_id',
        nested.map((log) => log.id),
      );

    if (eventsError) {
      // Les séances sont là, seuls les gains manquent : les afficher à zéro
      // serait un mensonge, ne rien afficher une régression. On garde les
      // séances et on signale l'incident.
      console.warn('[dashboard] lecture des gains impossible :', eventsError.message);
      setError('Les gains d’XP n’ont pas pu être relus.');
      setWorkouts(nested.map((log) => ({ log, xpGain: 0, strength: strengthOf(log) })));
      return;
    }

    const gains = new Map<string, number>();
    for (const event of events) {
      if (!event.source_id) continue;
      gains.set(event.source_id, (gains.get(event.source_id) ?? 0) + event.amount);
    }

    setWorkouts(
      nested.map((log) => ({
        log,
        xpGain: gains.get(log.id) ?? 0,
        strength: strengthOf(log),
      })),
    );
  }, [profileId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { workouts, error, reload: load };
}
