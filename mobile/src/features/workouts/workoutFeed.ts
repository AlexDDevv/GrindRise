import type { Database } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import type { StrengthSummarySource } from './workoutSummary';

/**
 * Lecture des séances enregistrées, et de ce qu'elles ont rapporté.
 *
 * Deux écrans s'en servent — l'activité récente du tableau de bord et
 * l'historique complet — et ils lisent exactement la même chose, à la page et
 * au filtre près. Le code vivait dans `useRecentWorkouts` ; l'historique
 * l'aurait dupliqué, avec sa jointure imbriquée et sa somme d'XP.
 *
 * **Lecture directe via la RLS** (`workout_logs_select_own`,
 * `xp_events_select_own`) : ce sont les lignes de l'appelant, exactement ce que
 * les policies couvrent. L'API n'entre en jeu que pour *écrire* une séance,
 * parce que l'XP s'y calcule.
 *
 * **Deux requêtes et non une jointure.** `xp_events.source_id` n'a pas de clé
 * étrangère vers `workout_logs` — la colonne désigne l'objet à l'origine du
 * gain, quel que soit son type —, donc PostgREST ne sait pas les relier.
 *
 * Le gain somme **tous** les événements d'une séance, et pas seulement celui de
 * type `workout` : un palier de série est un `xp_events` distinct qui porte le
 * même `source_id`. Ne compter que le premier afficherait « +64 » sur une
 * séance qui a rapporté 89, sans que rien n'explique l'écart.
 */

type WorkoutLog = Database['public']['Tables']['workout_logs']['Row'];

/** Une séance et ce qu'elle a rapporté. */
export type LoggedWorkout = {
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

export type ReadOptions = {
  limit: number;
  /**
   * Ne lire que ce qui précède cet instant, exclu — pagination par curseur.
   *
   * Un curseur et non un décalage : entre deux pages, une séance enregistrée
   * décalerait tout ce qui suit et ferait réapparaître une ligne déjà lue. Deux
   * séances au même instant à la microseconde près se masqueraient l'une
   * l'autre, mais `performed_at` est posé à l'envoi et la collision est hors
   * d'atteinte en usage réel.
   */
  before?: string;
  /** Un seul sport, ou tous. */
  sportId?: string | null;
};

export type WorkoutPage = {
  workouts: LoggedWorkout[];
  /**
   * Les séances sont là, seuls les gains manquent.
   *
   * Les afficher à zéro serait un mensonge, ne rien afficher une régression :
   * on garde les séances et on signale l'incident.
   */
  xpWarning: string | null;
};

/** Ce que la jointure imbriquée ramène en plus de la séance. */
type LogWithExercises = WorkoutLog & {
  logged_exercises: { id: string; logged_sets: { id: string }[] }[] | null;
};

/** Ce que la séance a d'exercices et de séries, pour le résumé. */
function strengthOf(log: LogWithExercises): StrengthSummarySource | null {
  const exercises = log.logged_exercises ?? [];
  if (exercises.length === 0) return null;

  return {
    exerciseCount: exercises.length,
    setCount: exercises.reduce((total, e) => total + e.logged_sets.length, 0),
  };
}

/** Levée quand les séances elles-mêmes sont illisibles. */
export class WorkoutFeedError extends Error {}

export async function readWorkouts(
  profileId: string,
  { limit, before, sportId }: ReadOptions,
): Promise<WorkoutPage> {
  let query = supabase
    .from('workout_logs')
    // Les exercices et leurs séries en une seule lecture : ils ont une clé
    // étrangère vers `workout_logs`, donc PostgREST sait les imbriquer — ce que
    // `xp_events` ne permet pas, d'où la seconde requête plus bas.
    //
    // Seuls les identifiants sont demandés : le résumé ne compte que des
    // lignes, et ramener charges et répétitions pour les jeter serait payer un
    // transfert pour rien.
    .select('*, logged_exercises(id, logged_sets(id))')
    .eq('profile_id', profileId)
    .order('performed_at', { ascending: false })
    .limit(limit);

  if (before) query = query.lt('performed_at', before);
  if (sportId) query = query.eq('sport_id', sportId);

  const { data: logs, error } = await query;

  if (error) {
    console.warn('[séances] lecture impossible :', error.message);
    throw new WorkoutFeedError('Impossible de charger tes séances.');
  }

  // Les types générés par Supabase ne portent pas la forme d'un `select`
  // imbriqué (précédent : `ProgramsService.list`, backend). L'assertion en deux
  // temps est nécessaire ; la RLS (`logged_exercises_select_own`,
  // `logged_sets_select_own`) garantit que ces lignes appartiennent bien à
  // l'appelant.
  const nested = logs as unknown as LogWithExercises[];

  if (nested.length === 0) return { workouts: [], xpWarning: null };

  const { data: events, error: eventsError } = await supabase
    .from('xp_events')
    .select('source_id, amount')
    .in(
      'source_id',
      nested.map((log) => log.id),
    );

  if (eventsError) {
    console.warn('[séances] lecture des gains impossible :', eventsError.message);

    return {
      workouts: nested.map((log) => ({ log, xpGain: 0, strength: strengthOf(log) })),
      xpWarning: 'Les gains d’XP n’ont pas pu être relus.',
    };
  }

  const gains = new Map<string, number>();
  for (const event of events) {
    if (!event.source_id) continue;
    gains.set(event.source_id, (gains.get(event.source_id) ?? 0) + event.amount);
  }

  return {
    workouts: nested.map((log) => ({
      log,
      xpGain: gains.get(log.id) ?? 0,
      strength: strengthOf(log),
    })),
    xpWarning: null,
  };
}
