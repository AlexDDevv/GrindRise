import { summarizeStrengthWorkout, workoutMetrics } from './workoutSummary';

const QUAND = '2026-08-24T18:00:00.000Z';
const MAINTENANT = new Date('2026-08-24T20:00:00.000Z');

describe('summarizeStrengthWorkout', () => {
  it('résume par exercices et séries, ce que la séance a vraiment contenu', () => {
    expect(
      summarizeStrengthWorkout({ exerciseCount: 3, setCount: 12 }, QUAND, MAINTENANT),
    ).toBe('Aujourd’hui · 3 exercices · 12 séries');
  });

  it('accorde le singulier', () => {
    expect(
      summarizeStrengthWorkout({ exerciseCount: 1, setCount: 1 }, QUAND, MAINTENANT),
    ).toBe('Aujourd’hui · 1 exercice · 1 série');
  });

  it('se réduit au jour pour une séance d’avant la refonte, qui n’a aucun exercice', () => {
    // Ses trois nombres ne décrivaient rien qu'on veuille réafficher.
    expect(
      summarizeStrengthWorkout({ exerciseCount: 0, setCount: 0 }, QUAND, MAINTENANT),
    ).toBe('Aujourd’hui');
  });
});

describe('workoutMetrics', () => {
  it('décrit une séance structurée par ses exercices, ses séries et sa durée', () => {
    expect(
      workoutMetrics('musculation', { durationMin: 52 }, { exerciseCount: 5, setCount: 18 }),
    ).toEqual([
      { label: 'Exos', value: '5' },
      { label: 'Séries', value: '18' },
      { label: 'Durée', value: '52', unit: 'min' },
    ]);
  });

  it('décrit un sport à formulaire plat par sa config', () => {
    // Les libellés viennent tels quels de `SPORT_METRIC_FIELDS` ; c'est la
    // carte qui les met en capitales au rendu.
    expect(workoutMetrics('course', { distanceKm: 8.2, durationMin: 40 }, null)).toEqual([
      { label: 'Distance', value: '8,2', unit: 'km' },
      { label: 'Durée', value: '40', unit: 'min' },
    ]);
  });

  it('ignore une clé que la config ne reconnaît pas, sans la deviner', () => {
    // La natation se mesure en mètres (`distanceM`) : une valeur portant
    // `distanceKm` ne lui correspond pas, et l'afficher en mètres mentirait
    // d'un facteur mille. Seule la durée, elle reconnue, ressort.
    expect(workoutMetrics('natation', { distanceKm: 1.5, durationMin: 45 }, null)).toEqual([
      { label: 'Durée', value: '45', unit: 'min' },
    ]);
  });

  it('retombe sur la durée seule pour une musculation d’avant la refonte', () => {
    // Aucune ligne dans `logged_exercises`, et plus aucune entrée de config
    // pour ce sport : sans ce repli, la carte détaillée dessinait une bande de
    // métriques entièrement vide.
    expect(workoutMetrics('musculation', { durationMin: 45 }, null)).toEqual([
      { label: 'Durée', value: '45', unit: 'min' },
    ]);
  });

  it('ne rend rien plutôt qu’une durée inventée', () => {
    // `metrics` est un `jsonb` : il peut être nul, vide, ou porter n'importe
    // quoi. Aucun de ces cas ne doit produire de métrique.
    expect(workoutMetrics('musculation', null, null)).toEqual([]);
    expect(workoutMetrics('musculation', {}, null)).toEqual([]);
    expect(workoutMetrics('musculation', { durationMin: 'longtemps' }, null)).toEqual([]);
  });

  it('ignore la durée d’une séance structurée sans exercice', () => {
    // `exerciseCount` à zéro décrit une séance qu'on ne veut pas réafficher
    // par ses anciens nombres : elle retombe sur le repli général.
    expect(workoutMetrics('musculation', { durationMin: 30 }, {
      exerciseCount: 0,
      setCount: 0,
    })).toEqual([]);
  });
});
