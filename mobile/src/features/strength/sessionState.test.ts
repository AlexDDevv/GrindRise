import {
  MAX_EXERCISES,
  MAX_SETS_PER_EXERCISE,
  addExercise,
  addSet,
  canAddExercise,
  canAddSet,
  createSession,
  createSessionFrom,
  emptyExerciseNames,
  lastSetOf,
  moveExercise,
  removeExercise,
  removeSet,
  setDurationOverride,
  setReordering,
  toggleCollapsed,
  updateSet,
} from './sessionState';
import type { SessionExerciseInput, SessionState, SetDraft } from './types';

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

const SERIE: SetDraft = {
  type: 'reps',
  reps: 10,
  weightKg: 80,
  isBodyweight: false,
};

/** Séance de départ, chrono figé pour que les tests ne dépendent pas de l'heure. */
const vide = (): SessionState => createSession(0);

describe('createSession', () => {
  it('ouvre une séance vide, libre, sans correction de durée ni réordonnancement', () => {
    expect(createSession(1_000)).toEqual({
      exercises: [],
      origin: null,
      startedAt: 1_000,
      durationOverrideMin: null,
      reordering: false,
    });
  });
});

describe('createSessionFrom', () => {
  const ORIGINE = {
    programWorkoutId: 'jour-1',
    programName: 'Push Pull Legs',
    workoutName: 'Jour Push',
  };

  it('pose les exercices dans l’ordre reçu, sans aucune série', () => {
    // Un jour type ne porte que l'ordre : ni séries, ni cibles de répétitions.
    const state = createSessionFrom(1_000, ORIGINE, [DEVELOPPE, TRACTIONS], ['k1', 'k2']);

    expect(state.exercises.map((e) => e.name)).toEqual([DEVELOPPE.name, TRACTIONS.name]);
    expect(state.exercises.every((e) => e.sets.length === 0)).toBe(true);
    expect(state.origin).toEqual(ORIGINE);
  });

  it('ne déplie que la première carte', () => {
    // Cinq cartes ouvertes font défiler avant d'avoir commencé, alors qu'on ne
    // saisit qu'un exercice à la fois.
    const state = createSessionFrom(1_000, ORIGINE, [DEVELOPPE, TRACTIONS], ['k1', 'k2']);

    expect(state.exercises.map((e) => e.collapsed)).toEqual([false, true]);
  });

  it('tient le plafond d’exercices d’une séance', () => {
    const trop = Array.from({ length: MAX_EXERCISES + 5 }, () => DEVELOPPE);
    const cles = trop.map((_, i) => `k${i}`);

    expect(createSessionFrom(1_000, ORIGINE, trop, cles).exercises).toHaveLength(
      MAX_EXERCISES,
    );
  });

  it('ouvre une séance vide pour un jour type sans exercice', () => {
    // Un jour créé et jamais rempli : la séance démarre quand même, et le
    // catalogue s'ouvre depuis l'écran comme pour une séance libre.
    const state = createSessionFrom(1_000, ORIGINE, [], []);

    expect(state.exercises).toEqual([]);
    expect(state.origin).toEqual(ORIGINE);
  });
});

describe('addExercise', () => {
  it('ajoute un exercice déplié et sans série', () => {
    const state = addExercise(vide(), DEVELOPPE, 'k1');

    expect(state.exercises).toEqual([
      { ...DEVELOPPE, key: 'k1', sets: [], collapsed: false },
    ]);
  });

  it('accepte deux fois le même exercice, en deux cartes distinctes', () => {
    // L'unicité en base porte sur l'ordre, pas sur l'exercice : on revient
    // vraiment sur un mouvement en fin de séance.
    const state = addExercise(addExercise(vide(), DEVELOPPE, 'k1'), DEVELOPPE, 'k2');

    expect(state.exercises).toHaveLength(2);
    expect(state.exercises.map((e) => e.key)).toEqual(['k1', 'k2']);
  });

  it('ne modifie pas l’état reçu', () => {
    const avant = vide();
    addExercise(avant, DEVELOPPE, 'k1');

    expect(avant.exercises).toEqual([]);
  });

  it('refuse d’ajouter au-delà du plafond du DTO', () => {
    let state = vide();
    for (let i = 0; i < MAX_EXERCISES; i += 1) {
      state = addExercise(state, DEVELOPPE, `k${i}`);
    }

    expect(canAddExercise(state)).toBe(false);
    expect(addExercise(state, TRACTIONS, 'trop').exercises).toHaveLength(MAX_EXERCISES);
  });
});

describe('removeExercise', () => {
  it('retire la carte visée et laisse les autres', () => {
    const state = addExercise(addExercise(vide(), DEVELOPPE, 'k1'), TRACTIONS, 'k2');

    expect(removeExercise(state, 'k1').exercises.map((e) => e.key)).toEqual(['k2']);
  });

  it('ignore une clé inconnue', () => {
    const state = addExercise(vide(), DEVELOPPE, 'k1');

    expect(removeExercise(state, 'absente').exercises).toHaveLength(1);
  });
});

describe('moveExercise', () => {
  const trois = () =>
    addExercise(
      addExercise(addExercise(vide(), DEVELOPPE, 'k1'), TRACTIONS, 'k2'),
      DEVELOPPE,
      'k3',
    );

  it('déplace vers le bas', () => {
    expect(moveExercise(trois(), 0, 2).exercises.map((e) => e.key)).toEqual([
      'k2',
      'k3',
      'k1',
    ]);
  });

  it('déplace vers le haut', () => {
    expect(moveExercise(trois(), 2, 0).exercises.map((e) => e.key)).toEqual([
      'k3',
      'k1',
      'k2',
    ]);
  });

  it('ignore un index hors bornes plutôt que de perdre une carte', () => {
    expect(moveExercise(trois(), 0, 9).exercises).toHaveLength(3);
    expect(moveExercise(trois(), -1, 0).exercises.map((e) => e.key)).toEqual([
      'k1',
      'k2',
      'k3',
    ]);
  });
});

describe('toggleCollapsed et setReordering', () => {
  it('replie puis déplie une carte', () => {
    const state = addExercise(vide(), DEVELOPPE, 'k1');

    expect(toggleCollapsed(state, 'k1').exercises[0].collapsed).toBe(true);
    expect(toggleCollapsed(toggleCollapsed(state, 'k1'), 'k1').exercises[0].collapsed).toBe(
      false,
    );
  });

  it('le mode réordonnancement ne touche pas au `collapsed` de chaque carte', () => {
    // Sortir du mode doit rendre à chaque carte l'état que l'utilisateur lui
    // avait donné, pas les rouvrir toutes.
    const state = toggleCollapsed(addExercise(vide(), DEVELOPPE, 'k1'), 'k1');
    const enOrdre = setReordering(state, true);

    expect(enOrdre.reordering).toBe(true);
    expect(enOrdre.exercises[0].collapsed).toBe(true);
    expect(setReordering(enOrdre, false).exercises[0].collapsed).toBe(true);
  });
});

describe('addSet, updateSet, removeSet', () => {
  const avecExercice = () => addExercise(vide(), DEVELOPPE, 'k1');

  it('ajoute une série à la carte visée', () => {
    expect(addSet(avecExercice(), 'k1', SERIE).exercises[0].sets).toEqual([SERIE]);
  });

  it('remplace la série d’un index donné', () => {
    const state = addSet(addSet(avecExercice(), 'k1', SERIE), 'k1', SERIE);
    const modifiee: SetDraft = { ...SERIE, reps: 6 };

    expect(updateSet(state, 'k1', 1, modifiee).exercises[0].sets).toEqual([
      SERIE,
      modifiee,
    ]);
  });

  it('supprime la série d’un index donné', () => {
    const state = addSet(addSet(avecExercice(), 'k1', SERIE), 'k1', {
      ...SERIE,
      reps: 6,
    });

    expect(removeSet(state, 'k1', 0).exercises[0].sets).toEqual([{ ...SERIE, reps: 6 }]);
  });

  it('refuse d’ajouter au-delà du plafond du DTO', () => {
    let state = avecExercice();
    for (let i = 0; i < MAX_SETS_PER_EXERCISE; i += 1) {
      state = addSet(state, 'k1', SERIE);
    }

    expect(canAddSet(state, 'k1')).toBe(false);
    expect(addSet(state, 'k1', SERIE).exercises[0].sets).toHaveLength(
      MAX_SETS_PER_EXERCISE,
    );
  });

  it('ignore une clé inconnue', () => {
    expect(addSet(avecExercice(), 'absente', SERIE).exercises[0].sets).toEqual([]);
  });
});

describe('lastSetOf', () => {
  it('rend la dernière série saisie, qui alimente « reprendre la précédente »', () => {
    const derniere: SetDraft = { ...SERIE, reps: 6, weightKg: 95 };
    const state = addSet(addSet(addExercise(vide(), DEVELOPPE, 'k1'), 'k1', SERIE), 'k1', derniere);

    expect(lastSetOf(state, 'k1')).toEqual(derniere);
  });

  it('rend null sur un exercice sans série', () => {
    expect(lastSetOf(addExercise(vide(), DEVELOPPE, 'k1'), 'k1')).toBeNull();
  });
});

describe('setDurationOverride', () => {
  it('pose la correction telle quelle quand elle est plausible', () => {
    expect(setDurationOverride(vide(), 52).durationOverrideMin).toBe(52);
  });

  it('écrête au maximum du DTO : la valeur affichée est celle qui partira', () => {
    // Le défaut réparé ici : 9 999 s'affichait dans l'en-tête, 1 440 partait,
    // et l'écran de fin annonçait « 24 h ». Trois valeurs pour un geste.
    expect(setDurationOverride(vide(), 9_999).durationOverrideMin).toBe(1_440);
  });

  it('remonte zéro et les négatifs à la minute, borne basse du DTO', () => {
    // `@Min(1)` sur `durationMin` : un 0 serait refusé par un 400.
    expect(setDurationOverride(vide(), 0).durationOverrideMin).toBe(1);
    expect(setDurationOverride(vide(), -30).durationOverrideMin).toBe(1);
  });

  it('ne modifie pas l’état reçu', () => {
    const avant = vide();
    setDurationOverride(avant, 52);

    expect(avant.durationOverrideMin).toBeNull();
  });
});

describe('emptyExerciseNames', () => {
  it('nomme les exercices sans série, que le DTO refuserait', () => {
    const state = addSet(
      addExercise(addExercise(vide(), DEVELOPPE, 'k1'), TRACTIONS, 'k2'),
      'k1',
      SERIE,
    );

    expect(emptyExerciseNames(state)).toEqual(['Tractions']);
  });

  it('ne nomme rien quand toutes les cartes portent au moins une série', () => {
    const state = addSet(addExercise(vide(), DEVELOPPE, 'k1'), 'k1', SERIE);

    expect(emptyExerciseNames(state)).toEqual([]);
  });
});
