import {
  computeSessionStats,
  formatSeconds,
  repsUnit,
  summarizeExercise,
} from './sessionStats';
import type { SessionExercise, SetDraft } from './types';

const carte = (sets: SetDraft[], name = 'Développé couché'): SessionExercise => ({
  key: `k-${name}`,
  exerciseId: 'ex',
  name,
  muscleGroup: 'pectoraux',
  sets,
  collapsed: false,
});

const reps = (r: number, weightKg: number | null, isBodyweight = false): SetDraft => ({
  type: 'reps',
  reps: r,
  weightKg,
  isBodyweight,
});

describe('formatSeconds', () => {
  it('tient ses bornes : zéro, la minute pleine, et l’heure', () => {
    // Testé jusqu'ici seulement à travers `summarizeExercise`, donc jamais sur
    // ses cas de bascule.
    expect(formatSeconds(0)).toBe('0:00');
    expect(formatSeconds(60)).toBe('1:00');
    expect(formatSeconds(3_600)).toBe('60:00');
  });

  it('complète les secondes à deux chiffres', () => {
    expect(formatSeconds(45)).toBe('0:45');
    expect(formatSeconds(125)).toBe('2:05');
  });
});

describe('repsUnit', () => {
  it('met le singulier à zéro comme à un, le pluriel au-delà', () => {
    // Le zéro prend le singulier en français ; l'abréviation s'accorde comme
    // le mot entier, contrairement à « kg » ou « min ».
    expect(repsUnit(0)).toBe('rép.');
    expect(repsUnit(1)).toBe('rép.');
    expect(repsUnit(2)).toBe('réps');
    expect(repsUnit(10)).toBe('réps');
  });

  it('garde l’étiquette neutre sur un champ encore vide', () => {
    // La feuille de saisie appelle `repsUnit(Number.parseInt(count, 10))` sur
    // la frappe brute, et `Number.parseInt('')` vaut `NaN`.
    expect(repsUnit(Number.parseInt('', 10))).toBe('réps');
  });
});

describe('computeSessionStats', () => {
  it("compte une séance vide à zéro, sans la dire partielle", () => {
    expect(computeSessionStats([])).toEqual({
      totalSets: 0,
      totalReps: 0,
      totalDurationSeconds: 0,
      tonnageKg: 0,
      tonnagePartial: false,
    });
  });

  it("somme séries, répétitions et tonnage sur charge externe", () => {
    // 10×80 + 8×90 + 6×95 = 800 + 720 + 570 = 2 090 — le chiffre de la maquette.
    const stats = computeSessionStats([
      carte([reps(10, 80), reps(8, 90), reps(6, 95)]),
    ]);

    expect(stats.totalSets).toBe(3);
    expect(stats.totalReps).toBe(24);
    expect(stats.tonnageKg).toBe(2_090);
    expect(stats.tonnagePartial).toBe(false);
  });

  it("exclut les séries au poids du corps et signale le total partiel", () => {
    // Aucune source de poids de corps n'est branchée : compter zéro donnerait
    // un chiffre plausible et faux, un total amputé annoncé comme tel non.
    const stats = computeSessionStats([
      carte([reps(10, 80)]),
      carte([reps(8, null, true), reps(6, 10, true)], 'Tractions'),
    ]);

    expect(stats.totalSets).toBe(3);
    expect(stats.totalReps).toBe(24);
    expect(stats.tonnageKg).toBe(800);
    expect(stats.tonnagePartial).toBe(true);
  });

  it("compte séries et répétitions même quand le tonnage est partiel", () => {
    const stats = computeSessionStats([carte([reps(8, null, true)], 'Tractions')]);

    expect(stats.totalSets).toBe(1);
    expect(stats.totalReps).toBe(8);
    expect(stats.tonnagePartial).toBe(true);
  });

  it("une série au temps ne rend pas le total partiel", () => {
    // Son absence du tonnage n'est pas une lacune : il n'y a pas de répétition
    // à multiplier.
    const stats = computeSessionStats([
      carte([{ type: 'time', durationSeconds: 45, weightKg: null, isBodyweight: false }],
        'Gainage'),
    ]);

    expect(stats.totalDurationSeconds).toBe(45);
    expect(stats.tonnageKg).toBe(0);
    expect(stats.tonnagePartial).toBe(false);
  });

  it("traite une charge nulle sur charge externe comme zéro kilo", () => {
    const stats = computeSessionStats([carte([reps(12, null)])]);

    expect(stats.tonnageKg).toBe(0);
    expect(stats.tonnagePartial).toBe(false);
  });

  it("arrondit le tonnage au centième", () => {
    expect(computeSessionStats([carte([reps(3, 20.555)])]).tonnageKg).toBe(61.67);
  });
});

describe('summarizeExercise', () => {
  it("résume une carte repliée sans jamais donner de tonnage", () => {
    // Il serait incomplet au poids du corps : la maquette l'écrit noir sur blanc.
    expect(summarizeExercise(carte([reps(8, null, true), reps(6, 10, true)], 'Tractions')))
      .toBe('2 séries · 14 réps · PDC');
  });

  it("résume une charge externe sans mention PDC", () => {
    expect(summarizeExercise(carte([reps(10, 80), reps(8, 90)]))).toBe(
      '2 séries · 18 réps',
    );
  });

  it("résume une série au temps par sa durée", () => {
    expect(
      summarizeExercise(
        carte([{ type: 'time', durationSeconds: 45, weightKg: null, isBodyweight: false }],
          'Gainage'),
      ),
    ).toBe('1 série · 0:45');
  });

  it("dit qu'une carte sans série est vide", () => {
    expect(summarizeExercise(carte([]))).toBe('Aucune série');
  });
});
