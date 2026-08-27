import { groupByMonth } from './historySections';
import type { LoggedWorkout } from './workoutFeed';

const seance = (performedAt: string, id = performedAt): LoggedWorkout => ({
  log: {
    id,
    profile_id: 'moi',
    sport_id: 'musculation',
    performed_at: performedAt,
    metrics: null,
    program_workout_id: null,
    created_at: performedAt,
  } as LoggedWorkout['log'],
  xpGain: 60,
  strength: null,
});

describe('groupByMonth', () => {
  it('rend une section par mois, dans l’ordre reçu', () => {
    const sections = groupByMonth([
      seance('2026-08-27T10:00:00Z'),
      seance('2026-08-02T10:00:00Z'),
      seance('2026-07-30T10:00:00Z'),
    ]);

    expect(sections.map((s) => s.key)).toEqual(['2026-08', '2026-07']);
    expect(sections[0].data).toHaveLength(2);
    expect(sections[1].data).toHaveLength(1);
  });

  it('sépare deux mois de même rang dans des années différentes', () => {
    // Une clé réduite au mois ferait fusionner août 2025 et août 2026 après un
    // an d'usage, ce qui ne se voit qu'au bout d'un an.
    const sections = groupByMonth([
      seance('2026-08-10T10:00:00Z'),
      seance('2025-08-10T10:00:00Z'),
    ]);

    expect(sections.map((s) => s.key)).toEqual(['2026-08', '2025-08']);
  });

  it('regroupe des séances non contiguës sous la même section', () => {
    // L'appelant lit du plus récent au plus ancien, donc le cas ne devrait pas
    // arriver — mais regrouper par clé plutôt que par rupture de séquence rend
    // la fonction indépendante de cette promesse.
    const sections = groupByMonth([
      seance('2026-08-27T10:00:00Z', 'a'),
      seance('2026-07-30T10:00:00Z', 'b'),
      seance('2026-08-02T10:00:00Z', 'c'),
    ]);

    expect(sections).toHaveLength(2);
    expect(sections[0].data.map((w) => w.log.id)).toEqual(['a', 'c']);
  });

  it('nomme le mois en français, en capitales', () => {
    const [section] = groupByMonth([seance('2026-08-27T10:00:00Z')]);

    expect(section.label).toBe('AOÛT 2026');
  });

  it('écarte une date illisible plutôt que d’inventer un mois', () => {
    const sections = groupByMonth([
      seance('2026-08-27T10:00:00Z', 'bonne'),
      seance('pas-une-date', 'abîmée'),
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0].data.map((w) => w.log.id)).toEqual(['bonne']);
  });

  it('rend une liste vide pour un historique vide', () => {
    expect(groupByMonth([])).toEqual([]);
  });
});
