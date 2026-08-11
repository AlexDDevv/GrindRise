import {
  beatsToUnlock,
  isBeatUnlocked,
  MAIN_TRACK,
  parseTrack,
  sportTrack,
  type BeatTrigger,
  type PlayerNarrativeState,
} from './narrative-rules';

/**
 * Ce que ces tests protègent : le découplage entre la classe du joueur et
 * l'accès aux trames annexes.
 *
 * C'est l'erreur d'architecture la plus tentante du projet — « il est Guerrier,
 * donc il a la trame Musculation » — et elle ne se voit pas à la relecture,
 * parce qu'elle produit un résultat correct pour le joueur mono-sport dont la
 * classe correspond au sport. Elle ne casse que sur le triathlète.
 */
describe('règles de déblocage narratif', () => {
  const beat = (overrides: Partial<BeatTrigger> = {}): BeatTrigger => ({
    track: MAIN_TRACK,
    trigger_type: 'global_level',
    trigger_value: 5,
    ...overrides,
  });

  const player = (
    overrides: Partial<PlayerNarrativeState> = {},
  ): PlayerNarrativeState => ({
    level: 1,
    sessionsBySport: {},
    ...overrides,
  });

  describe('tracks', () => {
    it('décompose la trame principale et les trames annexes', () => {
      expect(parseTrack(MAIN_TRACK)).toEqual({ kind: 'main', sportId: null });
      expect(parseTrack(sportTrack('natation'))).toEqual({
        kind: 'sport',
        sportId: 'natation',
      });
    });

    it('refuse un track sans sport plutôt que d’en inventer un', () => {
      expect(parseTrack('sport:')).toBeNull();
      expect(parseTrack('lore')).toBeNull();
    });
  });

  describe('trame principale', () => {
    it('s’ouvre au niveau global, sans regarder les séances', () => {
      const b = beat({ trigger_value: 5 });

      expect(isBeatUnlocked(b, player({ level: 4 }))).toBe(false);
      expect(isBeatUnlocked(b, player({ level: 5 }))).toBe(true);
      // Aucune séance, mais le niveau y est (XP d'une autre source) : le beat
      // s'ouvre quand même, c'est bien le niveau qui décide.
      expect(isBeatUnlocked(b, player({ level: 9, sessionsBySport: {} }))).toBe(
        true,
      );
    });
  });

  describe('trames annexes', () => {
    it('s’ouvrent au nombre de séances du sport, pas au niveau global', () => {
      const b = beat({
        track: sportTrack('course'),
        trigger_type: 'sport_sessions_count',
        trigger_value: 3,
      });

      // Niveau très élevé, mais seulement deux séances de course.
      expect(
        isBeatUnlocked(
          b,
          player({ level: 40, sessionsBySport: { course: 2 } }),
        ),
      ).toBe(false);

      // Niveau 1, mais trois séances : c'est la pratique qui ouvre la voie.
      expect(
        isBeatUnlocked(b, player({ level: 1, sessionsBySport: { course: 3 } })),
      ).toBe(true);
    });

    it('ne comptent que le sport visé', () => {
      const b = beat({
        track: sportTrack('velo'),
        trigger_type: 'sport_sessions_count',
        trigger_value: 2,
      });

      expect(
        isBeatUnlocked(
          b,
          player({ sessionsBySport: { musculation: 50, course: 30 } }),
        ),
      ).toBe(false);
    });

    it('un triathlète ouvre les trois voies avec une seule classe', () => {
      // Le cas qui justifie tout le découplage : la classe n'apparaît nulle
      // part dans `PlayerNarrativeState`, donc elle ne peut pas influer.
      const triathlete = player({
        level: 6,
        sessionsBySport: { course: 4, velo: 4, natation: 4 },
      });

      const voies = ['course', 'velo', 'natation'].map((sportId) =>
        beat({
          track: sportTrack(sportId),
          trigger_type: 'sport_sessions_count',
          trigger_value: 4,
        }),
      );

      expect(voies.map((v) => isBeatUnlocked(v, triathlete))).toEqual([
        true,
        true,
        true,
      ]);
    });

    it('un sport jamais pratiqué reste fermé, même à haut niveau', () => {
      const b = beat({
        track: sportTrack('natation'),
        trigger_type: 'sport_sessions_count',
        trigger_value: 1,
      });

      expect(
        isBeatUnlocked(b, player({ level: 50, sessionsBySport: {} })),
      ).toBe(false);
    });
  });

  describe('robustesse du contenu', () => {
    it('ne débloque rien sur un trigger inconnu', () => {
      // Ne rien ouvrir est le seul défaut acceptable : l'inverse offrirait du
      // contenu non gagné.
      expect(
        isBeatUnlocked(
          beat({ trigger_type: 'phase_de_lune' }),
          player({ level: 99 }),
        ),
      ).toBe(false);
    });

    it('ne débloque rien sur un track annexe malformé', () => {
      expect(
        isBeatUnlocked(
          beat({ track: 'sport:', trigger_type: 'sport_sessions_count' }),
          player({ sessionsBySport: { '': 99 } }),
        ),
      ).toBe(false);
    });
  });

  describe('sélection des beats à écrire', () => {
    const catalogue = [
      { id: 'a', ...beat({ trigger_value: 1 }) },
      { id: 'b', ...beat({ trigger_value: 5 }) },
      {
        id: 'c',
        ...beat({
          track: sportTrack('course'),
          trigger_type: 'sport_sessions_count',
          trigger_value: 2,
        }),
      },
    ];

    it('ne retient que les seuils atteints et pas déjà débloqués', () => {
      const nouveaux = beatsToUnlock(
        catalogue,
        player({ level: 5, sessionsBySport: { course: 2 } }),
        new Set(['a']),
      );

      expect(nouveaux.map((b) => b.id)).toEqual(['b', 'c']);
    });

    it('ne renvoie rien quand tout est déjà débloqué — la sync est rejouable', () => {
      const etat = player({ level: 5, sessionsBySport: { course: 2 } });
      const deja = new Set(['a', 'b', 'c']);

      expect(beatsToUnlock(catalogue, etat, deja)).toEqual([]);
    });
  });
});
