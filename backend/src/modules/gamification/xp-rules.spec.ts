import {
  computeEffortXp,
  computeStreak,
  computeWorkoutXp,
  isWithinBacklogWindow,
  levelForXp,
  missingMetricsFor,
  streakBonusFor,
  streakLength,
  XP_RULES,
} from './xp-rules';

/**
 * C'est la logique la plus exposée à l'exploitation : ces tests s'intéressent
 * moins au cas nominal qu'à ce que rapporte un mensonge, et à ce qui se passe
 * aux frontières (plafond atteint, chaîne cassée, rattrapage).
 */
describe('barème d’XP', () => {
  describe('bonus d’effort', () => {
    it('atteint son plafond à la séance de référence', () => {
      // 4 × 10 × 125 = 5 000, la référence en musculation.
      expect(
        computeEffortXp('musculation', { sets: 4, reps: 10, weightKg: 125 }),
      ).toBe(XP_RULES.effortMax);
    });

    it('ne dépasse jamais le plafond, quel que soit le mensonge', () => {
      const delirant = computeEffortXp('musculation', {
        sets: 999,
        reps: 999,
        weightKg: 999,
      });

      expect(delirant).toBe(XP_RULES.effortMax);
    });

    it('rend le gonflage peu rentable — c’est tout l’intérêt de la concavité', () => {
      // Un tricheur qui multiplie son volume par 100 ne multiplie pas son gain
      // par 100 : il passe de 4 à 40, et la séance de 64 à 100 XP.
      const honnete = computeEffortXp('course', { distanceKm: 0.08 });
      const menteur = computeEffortXp('course', { distanceKm: 8 });

      expect(honnete).toBe(4);
      expect(menteur).toBe(40);
      expect(computeWorkoutXp('course', { distanceKm: 8 }).total).toBe(100);
    });

    it('ne rapporte rien pour un effort nul, négatif ou absent', () => {
      expect(computeEffortXp('course', {})).toBe(0);
      expect(computeEffortXp('course', { distanceKm: 0 })).toBe(0);
      expect(computeEffortXp('course', { distanceKm: -50 })).toBe(0);
    });

    it('laisse un sport inconnu du barème rester loggable', () => {
      // Ajouter une ligne dans `sports` ne doit pas casser l'enregistrement,
      // seulement priver du bonus jusqu'à ce que la référence soit définie.
      expect(computeEffortXp('escalade', { durationMin: 90 })).toBe(0);
      expect(computeWorkoutXp('escalade', {}).total).toBe(XP_RULES.attendance);
    });
  });

  describe('présence', () => {
    it('crédite la présence même sans métrique exploitable', () => {
      expect(computeWorkoutXp('musculation', {})).toEqual({
        attendance: 60,
        effort: 0,
        total: 60,
      });
    });

    it('plafonne une séance à 100 XP', () => {
      const parfaite = computeWorkoutXp('natation', { distanceM: 3_000 });
      expect(parfaite.total).toBe(100);
    });

    it('donne le même maximum à tous les sports', () => {
      const totaux = [
        computeWorkoutXp('musculation', { sets: 10, reps: 10, weightKg: 100 })
          .total,
        computeWorkoutXp('course', { distanceKm: 20 }).total,
        computeWorkoutXp('natation', { distanceM: 4_000 }).total,
        computeWorkoutXp('cyclisme', { distanceKm: 80 }).total,
      ];

      // Aucun sport n'est rentable : un barème par sport en créerait
      // mécaniquement, puisque la courbe de niveaux est partagée.
      expect(new Set(totaux)).toEqual(new Set([100]));
    });
  });

  describe('métriques requises', () => {
    it('signale les champs manquants du sport', () => {
      expect(missingMetricsFor('musculation', { sets: 4 })).toEqual([
        'reps',
        'weightKg',
      ]);
    });

    it('traite une valeur nulle comme absente', () => {
      expect(missingMetricsFor('course', { distanceKm: 0 })).toEqual([
        'distanceKm',
      ]);
    });

    it('n’exige rien d’un sport sans règle', () => {
      expect(missingMetricsFor('escalade', {})).toEqual([]);
    });
  });
});

describe('streak', () => {
  describe('longueur de chaîne', () => {
    it('compte les jours consécutifs jusqu’au dernier', () => {
      const jours = new Set(['2026-08-09', '2026-08-10', '2026-08-11']);
      expect(streakLength(jours, '2026-08-11')).toBe(3);
    });

    it('s’arrête au premier trou', () => {
      const jours = new Set([
        '2026-08-05',
        '2026-08-09',
        '2026-08-10',
        '2026-08-11',
      ]);
      expect(streakLength(jours, '2026-08-11')).toBe(3);
    });

    it('vaut zéro si le jour de référence n’a pas de séance', () => {
      expect(streakLength(new Set(['2026-08-09']), '2026-08-11')).toBe(0);
    });
  });

  describe('nouvelle séance', () => {
    it('prolonge une chaîne vivante', () => {
      const streak = computeStreak(['2026-08-09', '2026-08-10'], '2026-08-11');

      expect(streak).toEqual({
        before: 2,
        after: 3,
        lastWorkoutOn: '2026-08-11',
      });
    });

    it('repart de 1 après une chaîne cassée', () => {
      // Dernière séance il y a une semaine : la chaîne est morte, la nouvelle
      // séance en ouvre une autre.
      const streak = computeStreak(['2026-08-03', '2026-08-04'], '2026-08-11');

      expect(streak).toEqual({
        before: 2,
        after: 1,
        lastWorkoutOn: '2026-08-11',
      });
    });

    it('démarre à 1 pour une première séance', () => {
      expect(computeStreak([], '2026-08-11')).toEqual({
        before: 0,
        after: 1,
        lastWorkoutOn: '2026-08-11',
      });
    });

    it('ne compte pas deux fois une seconde séance du même jour', () => {
      const streak = computeStreak(['2026-08-10', '2026-08-11'], '2026-08-11');

      expect(streak.after).toBe(2);
    });

    it('recolle un trou par une séance de rattrapage', () => {
      // Le jour manquant est le 10 ; le logger relie les deux morceaux.
      const streak = computeStreak(
        ['2026-08-08', '2026-08-09', '2026-08-11'],
        '2026-08-10',
      );

      expect(streak.before).toBe(1);
      expect(streak.after).toBe(4);
      // La séance est antérieure : le dernier jour de la chaîne ne recule pas.
      expect(streak.lastWorkoutOn).toBe('2026-08-11');
    });

    it('ne fait pas reculer la chaîne quand on log une séance ancienne isolée', () => {
      const streak = computeStreak(['2026-08-10', '2026-08-11'], '2026-08-05');

      expect(streak.after).toBe(2);
      expect(streak.lastWorkoutOn).toBe('2026-08-11');
    });

    it('converge quel que soit l’ordre de saisie', () => {
      // Ce que garantit le recalcul complet : rejouer l'historique dans un
      // autre ordre donne le même streak. Une règle « la chaîne n'avance que
      // vers le futur » dépendrait de l'ordre et ne convergerait pas.
      const jours = ['2026-08-09', '2026-08-10', '2026-08-11'];
      const ordreA = computeStreak([jours[0], jours[1]], jours[2]);
      const ordreB = computeStreak([jours[2], jours[0]], jours[1]);

      expect(ordreA.after).toBe(ordreB.after);
      expect(ordreA.lastWorkoutOn).toBe(ordreB.lastWorkoutOn);
    });
  });

  describe('paliers', () => {
    it('verse le bonus au jour du palier', () => {
      expect(streakBonusFor(2, 3)).toBe(10);
      expect(streakBonusFor(6, 7)).toBe(25);
      expect(streakBonusFor(13, 14)).toBe(50);
      expect(streakBonusFor(29, 30)).toBe(100);
    });

    it('ne verse rien entre deux paliers', () => {
      expect(streakBonusFor(3, 4)).toBe(0);
      expect(streakBonusFor(30, 31)).toBe(0);
    });

    it('ne redonne rien quand la chaîne n’avance pas ou recule', () => {
      expect(streakBonusFor(7, 7)).toBe(0);
      expect(streakBonusFor(7, 1)).toBe(0);
    });

    it('verse tous les paliers traversés d’un coup', () => {
      // Une séance de rattrapage peut faire sauter la chaîne de 2 à 8 jours :
      // les paliers 3 et 7 sont dus tous les deux.
      expect(streakBonusFor(2, 8)).toBe(35);
    });

    it('continue tous les 30 jours au-delà du dernier palier fixe', () => {
      expect(streakBonusFor(59, 60)).toBe(100);
      expect(streakBonusFor(89, 90)).toBe(100);
      expect(streakBonusFor(60, 61)).toBe(0);
    });

    it('plafonne le gain d’une séance de rattrapage à ce que l’antériorité permet', () => {
      // Au mieux, la fenêtre de 7 jours laisse recoller une chaîne : un joueur
      // ne peut pas se fabriquer 30 jours d'un coup.
      expect(streakBonusFor(0, 7)).toBe(35);
    });
  });
});

describe('antériorité', () => {
  it('accepte le jour même', () => {
    expect(isWithinBacklogWindow('2026-08-11', '2026-08-11')).toBe(true);
  });

  it('accepte la limite de la fenêtre', () => {
    expect(isWithinBacklogWindow('2026-08-04', '2026-08-11')).toBe(true);
  });

  it('refuse au-delà', () => {
    // Ce n'est plus un oubli, c'est un historique fabriqué après coup pour
    // récolter les paliers de streak.
    expect(isWithinBacklogWindow('2026-08-03', '2026-08-11')).toBe(false);
  });

  it('refuse le futur — la contrainte base le fait déjà, la règle le dit aussi', () => {
    expect(isWithinBacklogWindow('2026-08-12', '2026-08-11')).toBe(false);
  });
});

describe('niveau', () => {
  const PALIERS = [
    { level: 1, xp_required: 0 },
    { level: 2, xp_required: 100 },
    { level: 3, xp_required: 215 },
    { level: 4, xp_required: 347 },
  ];

  it('déduit le niveau de l’XP totale cumulée', () => {
    expect(levelForXp(PALIERS, 0)).toBe(1);
    expect(levelForXp(PALIERS, 99)).toBe(1);
    expect(levelForXp(PALIERS, 100)).toBe(2);
    expect(levelForXp(PALIERS, 214)).toBe(2);
    expect(levelForXp(PALIERS, 215)).toBe(3);
  });

  it('reste au dernier palier au-delà de la courbe', () => {
    expect(levelForXp(PALIERS, 999_999)).toBe(4);
  });

  it('ne descend jamais sous le niveau 1', () => {
    expect(levelForXp([], 0)).toBe(1);
    expect(levelForXp(PALIERS, -10)).toBe(1);
  });

  it('ne dépend pas de l’ordre des paliers', () => {
    expect(levelForXp([...PALIERS].reverse(), 215)).toBe(3);
  });
});
