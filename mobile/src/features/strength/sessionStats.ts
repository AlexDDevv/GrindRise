import type { SessionExercise, SetDraft } from './types';

/**
 * Statistiques d'une séance en cours, calculées localement.
 *
 * Jumeau de `computeStrengthStats` (`backend/src/modules/workouts/
 * strength-log.ts`), volontairement dupliqué : il n'existe pas de package
 * partagé dans ce monorepo, et l'en-tête de l'écran affiche ces chiffres avant
 * qu'aucune requête ne soit partie.
 *
 * **Le serveur reste l'autorité.** Le tonnage montré sur l'écran de fin est
 * celui de la réponse, pas celui-ci. Ce qu'on risque ici est un chiffre en
 * avance de quelques secondes, jamais une donnée écrite de travers.
 *
 * Le tonnage est la somme de `reps × charge`. Une série au poids du corps n'en
 * a pas de calculable — aucune source de poids de corps n'est branchée — donc
 * elle est **exclue** et `tonnagePartial` passe à vrai. Compter zéro donnerait
 * un chiffre plausible et faux. Le comptage des séries et des répétitions, lui,
 * ne dépend jamais du poids : il reste exact quand le tonnage ne l'est pas.
 */

export type SessionStats = {
  totalSets: number;
  totalReps: number;
  totalDurationSeconds: number;
  tonnageKg: number;
  /** Vrai si au moins une série a dû être exclue du tonnage. */
  tonnagePartial: boolean;
};

/** Les charges se saisissent au demi-kilo : le centième suffit largement. */
function roundKg(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeSessionStats(
  exercises: readonly SessionExercise[],
): SessionStats {
  const stats: SessionStats = {
    totalSets: 0,
    totalReps: 0,
    totalDurationSeconds: 0,
    tonnageKg: 0,
    tonnagePartial: false,
  };

  let tonnage = 0;

  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      stats.totalSets += 1;

      if (set.type === 'time') {
        stats.totalDurationSeconds += set.durationSeconds;
        // Pas de répétition à multiplier : son absence du tonnage n'est pas
        // une lacune, donc elle ne rend pas le total partiel.
        continue;
      }

      stats.totalReps += set.reps;

      if (set.isBodyweight) {
        stats.tonnagePartial = true;
        continue;
      }

      tonnage += set.reps * (set.weightKg ?? 0);
    }
  }

  stats.tonnageKg = roundKg(tonnage);

  return stats;
}

/**
 * Résumé d'une carte repliée : « 2 séries · 14 réps · PDC ».
 *
 * **Jamais de tonnage** : il serait incomplet dès qu'une série est au poids du
 * corps, et un résumé n'a pas la place d'expliquer pourquoi.
 */
export function summarizeExercise(exercise: SessionExercise): string {
  const { sets } = exercise;
  if (sets.length === 0) return 'Aucune série';

  const parts = [`${sets.length} série${sets.length > 1 ? 's' : ''}`];

  const reps = sets.reduce((total, set) => total + (set.type === 'reps' ? set.reps : 0), 0);
  // « 1 rép. » et non « 1 réps » : l'abréviation s'accorde comme le mot entier.
  if (reps > 0) parts.push(`${reps} rép${reps > 1 ? 's' : '.'}`);

  const seconds = sets.reduce(
    (total, set) => total + (set.type === 'time' ? set.durationSeconds : 0),
    0,
  );
  if (seconds > 0) parts.push(formatSeconds(seconds));

  if (sets.some(isBodyweight)) parts.push('PDC');

  return parts.join(' · ');
}

const isBodyweight = (set: SetDraft): boolean => set.isBodyweight;

/** `45` → `0:45`, `125` → `2:05`. La lecture, pas la saisie. */
export function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * « 1 rép. » ou « 10 réps ».
 *
 * L'abréviation d'un nom comptable s'accorde comme le mot entier, contrairement
 * à un symbole d'unité invariable comme « kg » ou « min ». Écrite ici et nulle
 * part ailleurs : cette règle a déjà divergé deux fois dans ce chantier.
 */
export function repsUnit(count: number): string {
  return count === 1 ? 'rép.' : 'réps';
}
