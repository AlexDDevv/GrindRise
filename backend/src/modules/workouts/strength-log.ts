/**
 * Séances structurées en exercices et séries : quels sports les utilisent, et
 * ce qu'on en déduit.
 *
 * Rien ici ne touche la base, pour la même raison que `xp-rules.ts` : ce sont
 * des règles, et elles doivent pouvoir être éprouvées cas limite par cas limite
 * sans Postgres. La différence avec `xp-rules.ts` est que rien ici n'a de
 * valeur de jeu — depuis le découplage, le volume soulevé ne rapporte plus
 * d'XP. Ces statistiques sont descriptives, pas rémunératrices, et c'est
 * précisément ce qui permet de les calculer à partir de champs saisis par le
 * joueur sans ouvrir de brèche.
 *
 * Rien n'est stocké : tout se recalcule à la demande, comme `user_progress` se
 * recalcule depuis `xp_events`.
 */

/**
 * Sports dont une séance se logue en exercices et séries plutôt qu'en
 * `metrics` jsonb plat.
 *
 * Un ensemble exporté plutôt qu'un `'musculation'` en dur dans le service : le
 * jour où un deuxième sport rejoint ce format, il n'y a qu'une ligne à
 * ajouter, et le DTO comme le service la lisent au même endroit.
 */
export const STRUCTURED_LOG_SPORTS: ReadonlySet<string> = new Set([
  'musculation',
]);

export function isStructuredLogSport(sportId: unknown): boolean {
  return typeof sportId === 'string' && STRUCTURED_LOG_SPORTS.has(sportId);
}

/**
 * Une série telle qu'elle sort de la base — d'où le `snake_case` et les `null`
 * plutôt que des champs absents.
 */
export type LoggedSetSnapshot = {
  type: 'reps' | 'time';
  reps: number | null;
  duration_seconds: number | null;
  /** Charge externe, ou lest additionnel quand `is_bodyweight` est vrai. */
  weight_kg: number | null;
  is_bodyweight: boolean;
};

export type LoggedExerciseSnapshot = {
  exercise_id: string;
  sets: LoggedSetSnapshot[];
};

export type ExerciseStats = {
  exerciseId: string;
  sets: number;
  reps: number;
  durationSeconds: number;
  tonnageKg: number;
  /** Vrai si au moins une série a dû être exclue du tonnage. */
  tonnagePartial: boolean;
};

export type StrengthStats = {
  totalSets: number;
  totalReps: number;
  totalDurationSeconds: number;
  tonnageKg: number;
  tonnagePartial: boolean;
  perExercise: ExerciseStats[];
};

export type StrengthStatsOptions = {
  /**
   * Poids de corps le plus récent, en kilogrammes.
   *
   * Sans lui, une série au poids du corps n'a pas de tonnage calculable. Le
   * suivi du poids de corps est un chantier à part ; ce paramètre est son point
   * de branchement, et c'est tout ce que ce fichier en sait. Il est là dès
   * maintenant pour que le brancher ne demande pas de redécouper cette
   * fonction.
   */
  bodyweightKg?: number | null;
};

/** Les charges se saisissent au demi-kilo : le centième suffit largement. */
function roundKg(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Séries, répétitions, durée et tonnage d'une séance.
 *
 * Le comptage des séries et des répétitions ne dépend jamais du poids : il
 * reste exact même quand le tonnage ne l'est pas.
 *
 * Le tonnage, lui, est la somme de `reps × charge`. Pour une série au poids du
 * corps, la charge est le poids de corps plus le lest éventuel — donc
 * incalculable tant qu'aucun poids n'est connu. Dans ce cas la série est
 * **exclue** et `tonnagePartial` passe à vrai, au niveau de l'exercice comme
 * du total. Compter zéro donnerait un chiffre plausible et faux ; un total
 * amputé, annoncé comme tel, laisse l'appelant décider quoi en dire.
 */
export function computeStrengthStats(
  exercises: readonly LoggedExerciseSnapshot[],
  options: StrengthStatsOptions = {},
): StrengthStats {
  // Un poids nul ou négatif n'est pas un poids : le traiter comme absent vaut
  // mieux que de propager un tonnage à zéro qui aurait l'air calculé.
  const bodyweight =
    typeof options.bodyweightKg === 'number' && options.bodyweightKg > 0
      ? options.bodyweightKg
      : null;

  const perExercise = exercises.map((exercise) => {
    let sets = 0;
    let reps = 0;
    let durationSeconds = 0;
    let tonnage = 0;
    let partial = false;

    for (const set of exercise.sets) {
      sets += 1;
      reps += set.reps ?? 0;
      durationSeconds += set.duration_seconds ?? 0;

      // Une série au temps n'a pas de répétition à multiplier. Son absence du
      // tonnage n'est pas une lacune, donc elle ne rend pas le total partiel.
      if (set.type !== 'reps' || set.reps === null) continue;

      if (!set.is_bodyweight) {
        tonnage += set.reps * (set.weight_kg ?? 0);
        continue;
      }

      if (bodyweight === null) {
        partial = true;
        continue;
      }

      tonnage += set.reps * (bodyweight + (set.weight_kg ?? 0));
    }

    return {
      exerciseId: exercise.exercise_id,
      sets,
      reps,
      durationSeconds,
      tonnageKg: roundKg(tonnage),
      tonnagePartial: partial,
    };
  });

  return {
    totalSets: perExercise.reduce((total, e) => total + e.sets, 0),
    totalReps: perExercise.reduce((total, e) => total + e.reps, 0),
    totalDurationSeconds: perExercise.reduce(
      (total, e) => total + e.durationSeconds,
      0,
    ),
    // Resommé depuis les totaux déjà arrondis : le total affiché est alors
    // exactement la somme des lignes affichées, sans écart d'un centime.
    tonnageKg: roundKg(
      perExercise.reduce((total, e) => total + e.tonnageKg, 0),
    ),
    tonnagePartial: perExercise.some((e) => e.tonnagePartial),
    perExercise,
  };
}
