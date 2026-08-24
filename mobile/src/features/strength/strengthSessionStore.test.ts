import { useStrengthSessionStore } from './strengthSessionStore';
import type { SessionExerciseInput } from './types';

const DEVELOPPE: SessionExerciseInput = {
  exerciseId: 'ex-1',
  name: 'Développé couché',
  muscleGroup: 'pectoraux',
};

const etat = () => useStrengthSessionStore.getState();

beforeEach(() => {
  etat().reset();
});

describe('useStrengthSessionStore', () => {
  it('démarre une séance vide et horodatée', () => {
    etat().start(1_000);

    expect(etat().session.exercises).toEqual([]);
    expect(etat().session.startedAt).toBe(1_000);
  });

  it('fabrique une clé distincte pour chaque exercice ajouté', () => {
    // C'est le store qui tire la clé : la générer dans le réducteur le rendrait
    // impur et forcerait ses tests à mocker le hasard.
    etat().addExercise(DEVELOPPE);
    etat().addExercise(DEVELOPPE);

    const [premier, second] = etat().session.exercises;

    expect(premier.key).not.toBe(second.key);
    expect(premier.exerciseId).toBe(second.exerciseId);
  });

  it("délègue l'ajout d'une série au réducteur", () => {
    etat().addExercise(DEVELOPPE);
    const { key } = etat().session.exercises[0];

    etat().addSet(key, { type: 'reps', reps: 10, weightKg: 80, isBodyweight: false });

    expect(etat().session.exercises[0].sets).toHaveLength(1);
  });

  it("enregistre une correction de durée", () => {
    etat().setDurationOverride(52);

    expect(etat().session.durationOverrideMin).toBe(52);
  });

  it("`reset` rend une séance vierge après un envoi réussi", () => {
    etat().addExercise(DEVELOPPE);
    etat().reset();

    expect(etat().session.exercises).toEqual([]);
    expect(etat().session.durationOverrideMin).toBeNull();
  });
});
