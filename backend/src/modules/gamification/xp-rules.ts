/**
 * Barème d'XP, plafonds anti-triche et streak — en fonctions pures.
 *
 * Rien ici ne touche la base : c'est la logique la plus susceptible d'être
 * exploitée, donc celle qui doit pouvoir être éprouvée cas limite par cas
 * limite sans Postgres. Le service se contente de lui fournir l'état lu et
 * d'écrire ce qu'elle renvoie.
 *
 * Principe du barème : toute métrique saisie par le joueur est falsifiable, la
 * seule question est ce que le mensonge rapporte. La présence pèse donc 60 %
 * du gain maximal, et l'effort déclaré n'en pèse que 40 %, sur une courbe
 * concave et plafonnée — au mieux, gonfler un champ fait passer une séance de
 * 60 à 100 XP. Un barème linéaire au volume, lui, multiplierait le gain par
 * cent.
 *
 * Pourquoi en TypeScript alors que la courbe de niveaux vit en base :
 * rééquilibrer la courbe est rétroactif (`recomputeProgress` reconvertit tout
 * l'historique), donc elle mérite d'échapper au redéploiement. Rééquilibrer le
 * barème ne l'est jamais — les `xp_events` déjà écrits sont immuables — donc le
 * mettre en base n'achèterait rien qu'un redéploiement n'achète déjà.
 */

import { addDays, daysBetween, type LocalDay } from './local-day';

/** Métriques saisies par le joueur, forme commune à tous les sports. */
export type WorkoutMetrics = {
  sets?: number;
  reps?: number;
  weightKg?: number;
  distanceKm?: number;
  distanceM?: number;
  durationMin?: number;
};

export type MetricField = keyof WorkoutMetrics;

type SportRule = {
  /** Champs sans lesquels la séance n'a pas de sens pour ce sport. */
  required: readonly MetricField[];
  /** Valeur d'effort brute, dans l'unité du sport. */
  effort: (metrics: WorkoutMetrics) => number;
  /** Effort d'une bonne séance : c'est là que le bonus atteint son plafond. */
  effortReference: number;
};

export const XP_RULES = {
  /** Versé dès qu'une séance est créditée, quel que soit le sport. */
  attendance: 60,
  /** Plafond du bonus d'effort. Une séance vaut donc 100 XP au maximum. */
  effortMax: 40,
  /** Séances créditées par jour local. Au-delà, la séance existe sans XP. */
  dailyCreditedWorkouts: 2,
  /** Deux séances plus rapprochées que ça ne sont pas deux séances. */
  minMinutesBetweenWorkouts: 30,
  /** Antériorité maximale : au-delà, la séance est refusée. */
  maxBacklogDays: 7,
} as const;

/**
 * Un barème commun à tous les sports, seule la référence d'effort change.
 * Un barème par sport créerait mécaniquement des sports rentables ; ici, à
 * effort équivalent, tous rapportent la même chose.
 *
 * Ces définitions ont un jumeau côté mobile (`mobile/src/features/workouts/
 * sportMetrics.ts`) qui construit le formulaire. Le serveur reste l'autorité :
 * un champ requis manquant est refusé, quoi qu'affiche le client.
 */
export const SPORT_RULES: Record<string, SportRule> = {
  musculation: {
    required: ['sets', 'reps', 'weightKg'],
    effort: (m) => (m.sets ?? 0) * (m.reps ?? 0) * (m.weightKg ?? 0),
    effortReference: 5_000,
  },
  course: {
    required: ['distanceKm'],
    effort: (m) => m.distanceKm ?? 0,
    effortReference: 8,
  },
  natation: {
    required: ['distanceM'],
    effort: (m) => m.distanceM ?? 0,
    effortReference: 1_500,
  },
  cyclisme: {
    required: ['distanceKm'],
    effort: (m) => m.distanceKm ?? 0,
    effortReference: 30,
  },
};

/**
 * Paliers de streak. Le bonus est fixe et versé une fois, pas un multiplicateur
 * : un multiplicateur composerait avec le reste, donc doublerait aussi le gain
 * d'une séance gonflée, et rendrait le total illisible pour le joueur.
 */
export const STREAK_MILESTONES = [
  { days: 3, bonus: 10 },
  { days: 7, bonus: 25 },
  { days: 14, bonus: 50 },
  { days: 30, bonus: 100 },
] as const;

/** Au-delà du dernier palier fixe, la récompense devient périodique. */
export const RECURRING_STREAK = { everyDays: 30, bonus: 100 } as const;

/** Champs attendus pour ce sport. Un sport sans règle n'exige rien. */
export function requiredMetricsFor(sportId: string): readonly MetricField[] {
  return SPORT_RULES[sportId]?.required ?? [];
}

/**
 * @returns les champs requis absents ou nuls, vide si la séance est complète.
 */
export function missingMetricsFor(
  sportId: string,
  metrics: WorkoutMetrics,
): MetricField[] {
  return requiredMetricsFor(sportId).filter((field) => {
    const value = metrics[field];
    return value === undefined || value === null || value <= 0;
  });
}

/**
 * Bonus d'effort : concave et plafonné.
 *
 * La racine carrée fait que doubler l'effort déclaré ne double jamais le
 * bonus, et le plafond le borne à 40 XP. Un sport inconnu du barème ne rapporte
 * pas d'effort mais reste loggable : ajouter une ligne dans `sports` ne doit
 * pas casser l'enregistrement.
 */
export function computeEffortXp(
  sportId: string,
  metrics: WorkoutMetrics,
): number {
  const rule = SPORT_RULES[sportId];
  if (!rule) return 0;

  const effort = rule.effort(metrics);
  if (!Number.isFinite(effort) || effort <= 0) return 0;

  const ratio = Math.min(1, Math.sqrt(effort / rule.effortReference));
  return Math.round(XP_RULES.effortMax * ratio);
}

export type WorkoutXp = {
  attendance: number;
  effort: number;
  total: number;
};

export function computeWorkoutXp(
  sportId: string,
  metrics: WorkoutMetrics,
): WorkoutXp {
  const attendance = XP_RULES.attendance;
  const effort = computeEffortXp(sportId, metrics);

  return { attendance, effort, total: attendance + effort };
}

/**
 * Longueur de la chaîne de jours consécutifs se terminant à `lastDay`.
 * Retourne 0 si `lastDay` n'est pas dans l'ensemble.
 */
export function streakLength(
  days: ReadonlySet<LocalDay>,
  lastDay: LocalDay,
): number {
  if (!days.has(lastDay)) return 0;

  let length = 0;
  let cursor = lastDay;

  while (days.has(cursor)) {
    length += 1;
    cursor = addDays(cursor, -1);
  }

  return length;
}

export type StreakState = {
  /** Longueur de la chaîne avant la nouvelle séance. */
  before: number;
  /** Longueur après. */
  after: number;
  /** Dernier jour porteur d'une séance, une fois la nouvelle prise en compte. */
  lastWorkoutOn: LocalDay;
};

/**
 * Recalcule le streak depuis l'historique complet plutôt qu'en incrémentant le
 * compteur existant.
 *
 * C'est ce qui le rend rejouable : une règle « le streak n'avance que vers le
 * futur » dépendrait de l'ordre dans lequel les séances ont été saisies, donc
 * ne convergerait pas. Le corollaire assumé est qu'une séance oubliée peut
 * réparer un trou — mais seulement dans la fenêtre d'antériorité, qui borne
 * cette réparation à sept jours.
 */
export function computeStreak(
  existingDays: readonly LocalDay[],
  newDay: LocalDay,
): StreakState {
  const before = new Set(existingDays);
  const after = new Set(before);
  after.add(newDay);

  const lastBefore = maxDay(before);
  const lastAfter = maxDay(after) ?? newDay;

  return {
    before: lastBefore ? streakLength(before, lastBefore) : 0,
    after: streakLength(after, lastAfter),
    lastWorkoutOn: lastAfter,
  };
}

function maxDay(days: ReadonlySet<LocalDay>): LocalDay | null {
  let max: LocalDay | null = null;
  for (const day of days) {
    if (max === null || day > max) max = day;
  }
  return max;
}

/**
 * Somme des paliers franchis entre deux longueurs de streak.
 *
 * Une séance de rattrapage peut faire sauter la chaîne de 2 à 5 jours d'un
 * coup : tous les paliers traversés sont dus, pas seulement le plus haut.
 */
export function streakBonusFor(before: number, after: number): number {
  if (after <= before) return 0;

  let bonus = 0;

  for (const milestone of STREAK_MILESTONES) {
    if (milestone.days > before && milestone.days <= after)
      bonus += milestone.bonus;
  }

  const lastFixed = STREAK_MILESTONES[STREAK_MILESTONES.length - 1].days;
  for (
    let day = lastFixed + RECURRING_STREAK.everyDays;
    day <= after;
    day += RECURRING_STREAK.everyDays
  ) {
    if (day > before) bonus += RECURRING_STREAK.bonus;
  }

  return bonus;
}

/**
 * Une séance peut être enregistrée dans le passé — on oublie de logger — mais
 * pas trop loin : au-delà, ce n'est plus un oubli, c'est un historique qu'on
 * se fabrique après coup pour récolter les paliers de streak.
 */
export function isWithinBacklogWindow(
  performedDay: LocalDay,
  today: LocalDay,
): boolean {
  const age = daysBetween(performedDay, today);
  return age >= 0 && age <= XP_RULES.maxBacklogDays;
}

/**
 * Niveau atteint pour un total d'XP cumulé.
 *
 * `current_xp` est l'XP TOTAL, pas l'XP dans le niveau courant : le niveau est
 * donc `max(level) where xp_required <= current_xp`. Les paliers n'ont pas
 * besoin d'être triés.
 */
export function levelForXp(
  thresholds: readonly { level: number; xp_required: number }[],
  totalXp: number,
): number {
  let level = 1;

  for (const threshold of thresholds) {
    if (threshold.xp_required <= totalXp && threshold.level > level) {
      level = threshold.level;
    }
  }

  return level;
}
