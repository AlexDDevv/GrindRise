import { summarizeStrengthWorkout } from './workoutSummary';

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
