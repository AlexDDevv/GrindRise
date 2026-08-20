import {
  computeStrengthStats,
  isStructuredLogSport,
  type LoggedExerciseSnapshot,
} from './strength-log';

/** Raccourci de lisibilité : une série en répétitions, charge externe. */
function serie(reps: number, weightKg: number | null) {
  return {
    type: 'reps' as const,
    reps,
    duration_seconds: null,
    weight_kg: weightKg,
    is_bodyweight: false,
  };
}

/** Une série au poids du corps, éventuellement lestée. */
function serieBodyweight(reps: number, lestKg: number | null = null) {
  return {
    type: 'reps' as const,
    reps,
    duration_seconds: null,
    weight_kg: lestKg,
    is_bodyweight: true,
  };
}

function serieTemps(seconds: number) {
  return {
    type: 'time' as const,
    reps: null,
    duration_seconds: seconds,
    weight_kg: null,
    is_bodyweight: false,
  };
}

describe('sports à log structuré', () => {
  it('reconnaît la musculation', () => {
    expect(isStructuredLogSport('musculation')).toBe(true);
  });

  it('laisse les autres sports au format plat', () => {
    expect(isStructuredLogSport('course')).toBe(false);
    expect(isStructuredLogSport('natation')).toBe(false);
    expect(isStructuredLogSport(undefined)).toBe(false);
  });
});

describe('statistiques dérivées', () => {
  it('compte séries et répétitions sans dépendre de la charge', () => {
    // Le comptage doit tenir même quand aucun tonnage n'est calculable :
    // c'est ce qui rend l'écran de séance lisible avant le chantier poids
    // de corps.
    const exercices: LoggedExerciseSnapshot[] = [
      { exercise_id: 'a', sets: [serieBodyweight(10), serieBodyweight(8)] },
      { exercise_id: 'b', sets: [serie(5, 100)] },
    ];

    const stats = computeStrengthStats(exercices);

    expect(stats.totalSets).toBe(3);
    expect(stats.totalReps).toBe(23);
  });

  it('additionne le tonnage des séries à charge externe', () => {
    const stats = computeStrengthStats([
      { exercise_id: 'a', sets: [serie(10, 80), serie(8, 90)] },
    ]);

    expect(stats.tonnageKg).toBe(10 * 80 + 8 * 90);
    expect(stats.tonnagePartial).toBe(false);
  });

  it('exclut les séries au poids du corps faute de poids connu, et le dit', () => {
    // Compter 0 donnerait un total plausible et faux. Un total amputé,
    // annoncé comme tel, est une information honnête.
    const stats = computeStrengthStats([
      { exercise_id: 'a', sets: [serie(10, 80), serieBodyweight(12)] },
    ]);

    expect(stats.tonnageKg).toBe(800);
    expect(stats.tonnagePartial).toBe(true);
  });

  it('intègre les séries au poids du corps dès qu\'un poids est fourni', () => {
    // Le point de branchement du chantier suivant : la même entrée, un
    // paramètre de plus, et le total cesse d'être partiel.
    const stats = computeStrengthStats(
      [{ exercise_id: 'a', sets: [serieBodyweight(10), serieBodyweight(5, 20)] }],
      { bodyweightKg: 75 },
    );

    expect(stats.tonnageKg).toBe(10 * 75 + 5 * (75 + 20));
    expect(stats.tonnagePartial).toBe(false);
  });

  it('ne compte jamais une série au temps dans le tonnage', () => {
    // Il n'y a pas de répétition à multiplier : son absence du tonnage n'est
    // pas une lacune, donc elle ne rend pas le total partiel.
    const stats = computeStrengthStats([
      { exercise_id: 'a', sets: [serieTemps(60), serieTemps(45)] },
    ]);

    expect(stats.totalDurationSeconds).toBe(105);
    expect(stats.totalSets).toBe(2);
    expect(stats.tonnageKg).toBe(0);
    expect(stats.tonnagePartial).toBe(false);
  });

  it('remonte le détail par exercice, chacun avec son propre drapeau', () => {
    const stats = computeStrengthStats([
      { exercise_id: 'developpe', sets: [serie(10, 80)] },
      { exercise_id: 'tractions', sets: [serieBodyweight(8)] },
    ]);

    expect(stats.perExercise).toEqual([
      {
        exerciseId: 'developpe',
        sets: 1,
        reps: 10,
        durationSeconds: 0,
        tonnageKg: 800,
        tonnagePartial: false,
      },
      {
        exerciseId: 'tractions',
        sets: 1,
        reps: 8,
        durationSeconds: 0,
        tonnageKg: 0,
        tonnagePartial: true,
      },
    ]);
  });

  it('tient un exercice sans série et une séance vide', () => {
    expect(computeStrengthStats([]).totalSets).toBe(0);

    const stats = computeStrengthStats([{ exercise_id: 'a', sets: [] }]);
    expect(stats.totalSets).toBe(0);
    expect(stats.perExercise).toHaveLength(1);
    expect(stats.tonnagePartial).toBe(false);
  });

  it('ignore un poids de corps absurde plutôt que de fausser le total', () => {
    const stats = computeStrengthStats(
      [{ exercise_id: 'a', sets: [serieBodyweight(10)] }],
      { bodyweightKg: 0 },
    );

    expect(stats.tonnageKg).toBe(0);
    expect(stats.tonnagePartial).toBe(true);
  });

  it('arrondit au centième, sans traîner de flottant', () => {
    const stats = computeStrengthStats([
      { exercise_id: 'a', sets: [serie(3, 20.1), serie(3, 0.2)] },
    ]);

    expect(stats.tonnageKg).toBe(60.9);
  });
});
