import {
  deletionWarning,
  exerciseCountLabel,
  exercisesOf,
  fullName,
  locate,
  programCountLabel,
  workoutCountLabel,
  workoutsOf,
} from './programState';
import type { Program, ProgramExercise, ProgramWorkout } from './types';

const exercice = (
  id: string,
  order: number,
  name = 'Développé couché',
): ProgramExercise => ({
  id: `pwe-${id}`,
  program_workout_id: 'jour-1',
  exercise_id: id,
  order_index: order,
  exercises: {
    id,
    name,
    muscle_group: 'pectoraux',
    created_at: '2026-08-01T00:00:00Z',
    created_by: null,
  },
});

const jour = (
  name: string,
  exercises: ProgramExercise[] | null | undefined,
  id = 'jour-1',
): ProgramWorkout => ({
  id,
  name,
  order_index: 0,
  program_id: 'prog-1',
  program_workout_exercises: exercises,
});

const programme = (
  name: string,
  workouts: ProgramWorkout[] | null | undefined,
  id = 'prog-1',
): Program => ({
  id,
  name,
  sport_id: 'musculation',
  profile_id: 'moi',
  created_at: '2026-08-01T00:00:00Z',
  program_workouts: workouts,
});

describe('workoutsOf', () => {
  it('rend un tableau vide quand la relation est nulle ou absente', () => {
    // PostgREST rend `null` et non `[]` pour une relation vide : sans ce
    // garde-fou, `.length` casse l'écran des programmes au premier programme
    // sans jour.
    expect(workoutsOf(programme('Vide', null))).toEqual([]);
    expect(workoutsOf(programme('Vide', undefined))).toEqual([]);
  });
});

describe('exercisesOf', () => {
  it('ordonne par rang, quel que soit l’ordre reçu', () => {
    const desordre = jour('Jour Push', [
      exercice('c', 2, 'Dips'),
      exercice('a', 0, 'Développé couché'),
      exercice('b', 1, 'Développé militaire'),
    ]);

    expect(exercisesOf(desordre).map((e) => e.name)).toEqual([
      'Développé couché',
      'Développé militaire',
      'Dips',
    ]);
  });

  it('écarte un exercice disparu du catalogue plutôt que de le rendre nul', () => {
    // La jointure vaut `null` si l'exercice a été supprimé. Le laisser passer
    // mettrait un `undefined.name` dans la liste et un `exerciseId` vide dans
    // la séance démarrée.
    const troue = jour('Jour Push', [
      exercice('a', 0),
      { ...exercice('b', 1), exercises: null },
    ]);

    expect(exercisesOf(troue)).toHaveLength(1);
    expect(exercisesOf(troue)[0].exerciseId).toBe('a');
  });

  it('rend les champs que la séance attend, et rien d’autre', () => {
    const [premier] = exercisesOf(jour('Jour Push', [exercice('a', 0)]));

    expect(premier).toEqual({
      exerciseId: 'a',
      name: 'Développé couché',
      muscleGroup: 'pectoraux',
    });
  });
});

describe('exerciseCountLabel', () => {
  it('accorde le pluriel et nomme le vide', () => {
    expect(exerciseCountLabel(jour('J', []))).toBe('AUCUN EXERCICE');
    expect(exerciseCountLabel(jour('J', [exercice('a', 0)]))).toBe('1 EXERCICE');
    expect(exerciseCountLabel(jour('J', [exercice('a', 0), exercice('b', 1)]))).toBe(
      '2 EXERCICES',
    );
  });

  it('compte la ligne et non l’exercice retrouvé', () => {
    // Un exercice disparu occupe toujours un rang : annoncer « 1 exercice »
    // pour un jour qui en aligne deux serait plus troublant que l'inverse.
    const troue = jour('J', [exercice('a', 0), { ...exercice('b', 1), exercises: null }]);

    expect(exerciseCountLabel(troue)).toBe('2 EXERCICES');
  });
});

describe('workoutCountLabel', () => {
  it('accorde les deux mots du groupe', () => {
    expect(workoutCountLabel(programme('P', []))).toBe('AUCUN JOUR TYPE');
    expect(workoutCountLabel(programme('P', [jour('A', [])]))).toBe('1 JOUR TYPE');
    expect(
      workoutCountLabel(programme('P', [jour('A', [], 'a'), jour('B', [], 'b')])),
    ).toBe('2 JOURS TYPES');
  });
});

describe('programCountLabel', () => {
  it('accorde le pluriel et nomme le vide', () => {
    expect(programCountLabel([])).toBe('AUCUN PROGRAMME');
    expect(programCountLabel([programme('P', [])])).toBe('1 PROGRAMME');
    expect(programCountLabel([programme('P', [], 'a'), programme('Q', [], 'b')])).toBe(
      '2 PROGRAMMES',
    );
  });
});

describe('locate', () => {
  const programmes = [
    programme('Push Pull Legs', [jour('Jour Push', [], 'push')], 'ppl'),
    programme('Haut / Bas', [jour('Jour Haut', [], 'haut')], 'hb'),
  ];

  it('retrouve un jour dans le programme qui le porte', () => {
    const trouve = locate(programmes, 'haut');

    expect(trouve?.program.name).toBe('Haut / Bas');
    expect(trouve?.workout.name).toBe('Jour Haut');
  });

  it('rend null pour un jour supprimé entre-temps', () => {
    // L'écran de séance garde l'identifiant de son jour type : celui-ci peut
    // avoir été supprimé pendant la séance.
    expect(locate(programmes, 'disparu')).toBeNull();
  });
});

describe('fullName', () => {
  it('nomme le jour avec son programme', () => {
    expect(fullName(programme('Push Pull Legs', []), jour('Jour Pull', []))).toBe(
      'Push Pull Legs · Jour Pull',
    );
  });
});

describe('deletionWarning', () => {
  it('dit combien de jours partent, en accordant le verbe', () => {
    expect(deletionWarning(programme('P', []))).toMatch(/aucun jour type/i);
    // Le déterminant change avec le nombre : « Ses 1 jour type » se fabrique
    // tout seul si l'on se contente d'accorder le pluriel.
    expect(deletionWarning(programme('P', [jour('A', [], 'a')]))).toContain(
      'Son jour type part avec lui.',
    );
    expect(
      deletionWarning(programme('P', [jour('A', [], 'a'), jour('B', [], 'b')])),
    ).toContain('Ses 2 jours types partent avec lui.');
  });

  it('rassure sur l’historique dans tous les cas', () => {
    // `workout_logs.program_workout_id` est en `on delete set null` : les
    // séances déjà enregistrées survivent, et c'est la première inquiétude
    // devant une suppression.
    for (const p of [programme('P', []), programme('P', [jour('A', [], 'a')])]) {
      expect(deletionWarning(p)).toContain('restent dans ton historique');
    }
  });
});
