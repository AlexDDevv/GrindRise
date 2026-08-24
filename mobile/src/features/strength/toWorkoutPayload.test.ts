import { addExercise, addSet, createSession } from './sessionState';
import { STRENGTH_SPORT_ID, toWorkoutPayload } from './toWorkoutPayload';
import type { SessionExerciseInput } from './types';

const MINUTE = 60_000;

const DEVELOPPE: SessionExerciseInput = {
  exerciseId: 'ex-1',
  name: 'Développé couché',
  muscleGroup: 'pectoraux',
};

const TRACTIONS: SessionExerciseInput = {
  exerciseId: 'ex-2',
  name: 'Tractions',
  muscleGroup: 'dos',
};

describe('toWorkoutPayload', () => {
  const seance = () =>
    addSet(
      addSet(addExercise(createSession(0), DEVELOPPE, 'k1'), 'k1', {
        type: 'reps',
        reps: 10,
        weightKg: 80,
        isBodyweight: false,
      }),
      'k1',
      { type: 'reps', reps: 8, weightKg: null, isBodyweight: true },
    );

  it('produit un corps que le validateur de cohérence accepte', () => {
    const body = toWorkoutPayload(seance(), 52 * MINUTE);

    expect(body.sportId).toBe(STRENGTH_SPORT_ID);
    expect(body.exercises).toHaveLength(1);
    expect(body.exercises[0].exerciseId).toBe('ex-1');
    expect(body.exercises[0].sets).toHaveLength(2);
  });

  it('omet la charge nulle plutôt que d’envoyer zéro', () => {
    // Le DTO accepterait 0, mais ce serait une charge déclarée. `weight_kg`
    // doit rester nul en base pour une traction sans lest.
    const [premiere, seconde] = toWorkoutPayload(seance(), 0).exercises[0].sets;

    expect(premiere).toEqual({ type: 'reps', reps: 10, weightKg: 80 });
    expect(seconde).toEqual({ type: 'reps', reps: 8, isBodyweight: true });
    expect('weightKg' in seconde).toBe(false);
  });

  it('n’envoie jamais reps et durationSeconds ensemble', () => {
    // `LoggedSetShapeMatchesType` refuse le corps sinon.
    const avecTemps = addSet(addExercise(createSession(0), TRACTIONS, 'k2'), 'k2', {
      type: 'time',
      durationSeconds: 45,
      weightKg: null,
      isBodyweight: false,
    });

    expect(toWorkoutPayload(avecTemps, 0).exercises[0].sets[0]).toEqual({
      type: 'time',
      durationSeconds: 45,
    });
  });

  it('omet `isBodyweight` quand il est faux, pour un corps minimal', () => {
    expect('isBodyweight' in toWorkoutPayload(seance(), 0).exercises[0].sets[0]).toBe(
      false,
    );
  });

  it('porte la durée, et rien d’autre, dans `metrics`', () => {
    const body = toWorkoutPayload(seance(), 52 * MINUTE);

    expect(body.metrics).toEqual({ durationMin: 52 });
    expect(Object.keys(body.metrics)).toEqual(['durationMin']);
  });

  it('respecte la durée corrigée plutôt que le chrono', () => {
    const corrigee = { ...seance(), durationOverrideMin: 52 };

    expect(toWorkoutPayload(corrigee, 4 * 60 * MINUTE).metrics).toEqual({
      durationMin: 52,
    });
  });

  it('envoie `performedAt` en ISO avec fuseau', () => {
    const body = toWorkoutPayload(seance(), 0);

    expect(body.performedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  });

  it('n’émet aucun `programWorkoutId` : ce chantier ne fait pas de programmes', () => {
    expect('programWorkoutId' in toWorkoutPayload(seance(), 0)).toBe(false);
  });

  it('conserve l’ordre des exercices, qui devient `order_index`', () => {
    const deux = addSet(addExercise(seance(), TRACTIONS, 'k2'), 'k2', {
      type: 'reps',
      reps: 6,
      weightKg: null,
      isBodyweight: true,
    });

    expect(toWorkoutPayload(deux, 0).exercises.map((e) => e.exerciseId)).toEqual([
      'ex-1',
      'ex-2',
    ]);
  });
});
