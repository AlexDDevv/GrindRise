/**
 * État de la série de jours consécutifs.
 *
 * `user_progress.streak_days` ne suffit pas à l'afficher, et c'est le seul
 * piège de cet écran : « 10 » ne distingue pas dix jours en cours de dix jours
 * éteints depuis mars. Le serveur ne remet pas le compteur à zéro quand la
 * chaîne meurt — il faudrait une tâche quotidienne, et rien n'en exécute
 * aujourd'hui. `last_workout_on` est là pour ça.
 *
 * La règle est celle du serveur : la chaîne se termine au jour de la dernière
 * séance. Elle est donc encore vivante si cette séance est d'aujourd'hui, et
 * toujours rattrapable si elle est d'hier — logger avant minuit la prolonge.
 * Au-delà, elle est rompue, quel que soit le compteur.
 */

export type StreakStatus = {
  /** Jours de la chaîne, zéro si elle est rompue. */
  days: number;
  /** La séance du jour est faite. */
  isToday: boolean;
  /**
   * La chaîne compte encore mais réclame une séance aujourd'hui. C'est le seul
   * état qui mérite d'être signalé au joueur.
   */
  isAtRisk: boolean;
};

/**
 * @param streakDays `user_progress.streak_days`.
 * @param lastWorkoutOn `user_progress.last_workout_on`, jour local de la
 *   dernière séance au format `YYYY-MM-DD`. Nul si aucune séance n'existe.
 */
export function streakStatus(
  streakDays: number,
  lastWorkoutOn: string | null,
  now: Date = new Date(),
): StreakStatus {
  if (!lastWorkoutOn || streakDays === 0) {
    return { days: 0, isToday: false, isAtRisk: false };
  }

  const today = localDay(now);
  const yesterday = localDay(new Date(now.getTime() - 86_400_000));

  if (lastWorkoutOn === today) {
    return { days: streakDays, isToday: true, isAtRisk: false };
  }

  if (lastWorkoutOn === yesterday) {
    return { days: streakDays, isToday: false, isAtRisk: true };
  }

  // Rompue. Le compteur du serveur vaut encore l'ancienne chaîne : afficher
  // zéro est la seule lecture honnête, sinon la jauge mentirait jusqu'à la
  // prochaine séance.
  return { days: 0, isToday: false, isAtRisk: false };
}

/**
 * Jour local au format que porte `last_workout_on`.
 *
 * Construit champ par champ plutôt que par `toISOString()`, qui convertit en
 * UTC : à 1 h du matin en France, il rendrait la date de la veille et ferait
 * paraître rompue une chaîne parfaitement vivante.
 */
function localDay(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}
