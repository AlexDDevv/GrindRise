import { addExercise, addSet, createSession, createSessionFrom } from './sessionState';
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

describe('toWorkoutPayload · jour type', () => {
  const ORIGINE = {
    programWorkoutId: '6f1c2b7e-0000-4000-8000-000000000001',
    programName: 'Push Pull Legs',
    workoutName: 'Jour Push',
  };

  it('omet le jour type pour une séance libre, au lieu de l’envoyer nul', () => {
    // `@IsOptional()` accepte l'absence ; un `null` explicite échouerait sur
    // `@IsUUID()` et ferait refuser toute séance libre.
    const corps = toWorkoutPayload(createSession(0), 60_000);

    expect('programWorkoutId' in corps).toBe(false);
  });

  it('porte le jour type quand la séance en vient', () => {
    const state = createSessionFrom(0, ORIGINE, [DEVELOPPE], ['k1']);

    expect(toWorkoutPayload(state, 60_000).programWorkoutId).toBe(
      ORIGINE.programWorkoutId,
    );
  });

  it('n’envoie que l’identifiant, jamais les noms affichés', () => {
    // Les deux noms ne servent qu'à l'en-tête de l'écran : le serveur les relit
    // depuis sa propre table, et `forbidNonWhitelisted` refuserait le corps.
    const state = createSessionFrom(0, ORIGINE, [DEVELOPPE], ['k1']);
    const corps = toWorkoutPayload(state, 60_000);

    expect(JSON.stringify(corps)).not.toContain('Push Pull Legs');
    expect(JSON.stringify(corps)).not.toContain('Jour Push');
  });
});
