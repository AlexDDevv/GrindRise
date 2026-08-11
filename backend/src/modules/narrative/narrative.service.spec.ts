import { NotFoundException } from '@nestjs/common';

import { SupabaseService } from '../../supabase/supabase.service';
import { NarrativeService } from './narrative.service';

/**
 * Le service est bouchonné au niveau de PostgREST : ce qui est vérifié ici,
 * c'est ce qu'il écrit et la forme de ce qu'il renvoie, pas le SQL — celui-ci
 * est couvert par `supabase/tests/schema.test.mjs`, contre un vrai Postgres.
 */
describe('NarrativeService', () => {
  const PROFILE_ID = '3f8b1c2e-6d4a-4f1b-9c7e-2a5d8e0b4f16';

  type BeatRow = {
    id: string;
    track: string;
    order_index: number;
    trigger_type: string;
    trigger_value: number;
    sport_id: string | null;
    title: string;
    body: string;
    created_at: string;
  };

  type UnlockRow = {
    profile_id: string;
    beat_id: string;
    unlocked_at: string;
    read_at: string | null;
  };

  type Fixture = {
    level: number;
    sessions: { sport_id: string; sessions: number }[];
    beats: BeatRow[];
    unlocks: UnlockRow[];
  };

  function beat(overrides: Partial<BeatRow> & { id: string }): BeatRow {
    const track = overrides.track ?? 'main';

    return {
      track,
      order_index: 1,
      trigger_type: track === 'main' ? 'global_level' : 'sport_sessions_count',
      trigger_value: 1,
      sport_id: track === 'main' ? null : track.slice('sport:'.length),
      title: '',
      body: '',
      created_at: '2026-08-11T09:00:00.000Z',
      ...overrides,
    };
  }

  /**
   * Bouchon minimal de PostgREST.
   *
   * L'upsert alimente vraiment `fixture.unlocks` : le service relit les
   * déblocages après écriture, et un bouchon qui ne le refléterait pas rendrait
   * ce comportement invérifiable.
   */
  function buildService(fixture: Fixture) {
    const inserted: { profile_id: string; beat_id: string }[] = [];

    const builderFor = (table: string) => {
      const filters: Record<string, unknown> = {};
      let upserted: { profile_id: string; beat_id: string }[] | null = null;
      // Les `.eq()` arrivent après le `.update()` dans la chaîne PostgREST :
      // la valeur est donc retenue, et appliquée seulement à la fin.
      let pendingUpdate: { read_at: string } | null = null;

      const targetUnlock = (): UnlockRow | undefined =>
        fixture.unlocks.find(
          (row) =>
            row.profile_id === filters.profile_id &&
            row.beat_id === filters.beat_id,
        );

      const rows = (): unknown[] => {
        if (upserted) return upserted.map((row) => ({ beat_id: row.beat_id }));
        if (table === 'narrative_beats') return fixture.beats;
        return fixture.unlocks.filter(
          (row) => row.profile_id === filters.profile_id,
        );
      };

      const builder: Record<string, unknown> = {
        select: () => builder,
        order: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        upsert: (values: { profile_id: string; beat_id: string }[]) => {
          // `ignoreDuplicates` : seules les lignes réellement nouvelles sont
          // renvoyées, comme le fait `on conflict do nothing`.
          const nouveaux = values.filter(
            (row) =>
              !fixture.unlocks.some(
                (existing) =>
                  existing.profile_id === row.profile_id &&
                  existing.beat_id === row.beat_id,
              ),
          );

          inserted.push(...nouveaux);
          fixture.unlocks.push(
            ...nouveaux.map((row) => ({
              ...row,
              unlocked_at: '2026-08-11T10:00:00.000Z',
              read_at: null,
            })),
          );

          upserted = nouveaux;
          return builder;
        },
        update: (values: { read_at: string }) => {
          pendingUpdate = values;
          return builder;
        },
        maybeSingle: () => {
          if (table === 'user_progress') {
            return Promise.resolve({
              data: { level: fixture.level },
              error: null,
            });
          }

          return Promise.resolve({ data: targetUnlock() ?? null, error: null });
        },
        single: () => {
          const target = targetUnlock();

          if (target && pendingUpdate) {
            target.read_at = pendingUpdate.read_at;
          }

          return Promise.resolve({ data: target ?? null, error: null });
        },
        then: (
          onFulfilled: (value: { data: unknown; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) =>
          Promise.resolve({ data: rows(), error: null }).then(
            onFulfilled,
            onRejected,
          ),
      };

      return builder;
    };

    const supabase = {
      client: {
        from: (table: string) => builderFor(table),
        rpc: () => Promise.resolve({ data: fixture.sessions, error: null }),
      },
    } as unknown as SupabaseService;

    return { service: new NarrativeService(supabase), inserted };
  }

  describe('syncUnlocks', () => {
    it('n’écrit que les beats dont le seuil vient d’être franchi', async () => {
      const { service, inserted } = buildService({
        level: 3,
        sessions: [{ sport_id: 'course', sessions: 2 }],
        beats: [
          beat({ id: 'principal-1', trigger_value: 1 }),
          beat({ id: 'principal-9', trigger_value: 9 }),
          beat({ id: 'course-2', track: 'sport:course', trigger_value: 2 }),
          beat({ id: 'velo-1', track: 'sport:velo', trigger_value: 1 }),
        ],
        unlocks: [],
      });

      const nouveaux = await service.syncUnlocks(PROFILE_ID);

      expect(nouveaux.map((b) => b.id).sort()).toEqual([
        'course-2',
        'principal-1',
      ]);
      expect(inserted).toHaveLength(2);
    });

    it('est rejouable : un second passage n’écrit rien', async () => {
      const { service, inserted } = buildService({
        level: 3,
        sessions: [],
        beats: [beat({ id: 'principal-1', trigger_value: 1 })],
        unlocks: [],
      });

      await service.syncUnlocks(PROFILE_ID);
      const second = await service.syncUnlocks(PROFILE_ID);

      expect(second).toEqual([]);
      expect(inserted).toHaveLength(1);
    });

    it('fait confiance au niveau fourni par l’appelant', async () => {
      // Celui qui sort de la transaction d'octroi d'XP est plus frais que ce
      // qu'une relecture ramènerait.
      const { service } = buildService({
        level: 1,
        sessions: [],
        beats: [beat({ id: 'principal-7', trigger_value: 7 })],
        unlocks: [],
      });

      expect(await service.syncUnlocks(PROFILE_ID, 7)).toHaveLength(1);
    });

    it('ouvre les trois voies d’un triathlète sans jamais lire sa classe', async () => {
      const { service } = buildService({
        level: 2,
        sessions: [
          { sport_id: 'course', sessions: 3 },
          { sport_id: 'velo', sessions: 3 },
          { sport_id: 'natation', sessions: 3 },
        ],
        beats: [
          beat({ id: 'course', track: 'sport:course', trigger_value: 3 }),
          beat({ id: 'velo', track: 'sport:velo', trigger_value: 3 }),
          beat({ id: 'natation', track: 'sport:natation', trigger_value: 3 }),
        ],
        unlocks: [],
      });

      const nouveaux = await service.syncUnlocks(PROFILE_ID);

      // Le bouchon ne sert jamais `profiles` : si le service y touchait pour
      // lire `class_id`, il tomberait ici.
      expect(nouveaux).toHaveLength(3);
    });
  });

  describe('getState', () => {
    it('groupe par trame et ne renvoie que le contenu débloqué', async () => {
      const { service } = buildService({
        level: 2,
        sessions: [{ sport_id: 'course', sessions: 4 }],
        beats: [
          beat({ id: 'p1', order_index: 1, trigger_value: 1 }),
          beat({ id: 'p2', order_index: 2, trigger_value: 2 }),
          beat({ id: 'p9', order_index: 3, trigger_value: 9 }),
          beat({
            id: 'c1',
            track: 'sport:course',
            order_index: 1,
            trigger_value: 4,
          }),
        ],
        unlocks: [],
      });

      const state = await service.getState(PROFILE_ID);

      expect(state.level).toBe(2);
      expect(state.tracks.map((t) => t.track)).toEqual([
        'main',
        'sport:course',
      ]);
      // `p9` n'est pas atteint : son texte ne sort pas de l'API.
      expect(state.tracks[0].beats.map((b) => b.id)).toEqual(['p1', 'p2']);
      expect(state.tracks[1].beats.map((b) => b.id)).toEqual(['c1']);
      expect(state.tracks[1].sessions).toBe(4);
      expect(state.unreadCount).toBe(3);
    });

    it('affiche une voie commencée avant son premier palier', async () => {
      // Sans ça, le mobile ne pourrait pas montrer la section d'un sport
      // pratiqué tant qu'aucun beat n'y est tombé.
      const { service } = buildService({
        level: 1,
        sessions: [{ sport_id: 'natation', sessions: 1 }],
        beats: [beat({ id: 'n5', track: 'sport:natation', trigger_value: 5 })],
        unlocks: [],
      });

      const state = await service.getState(PROFILE_ID);
      const natation = state.tracks.find((t) => t.sportId === 'natation');

      expect(natation).toBeDefined();
      expect(natation?.sessions).toBe(1);
      expect(natation?.beats).toEqual([]);
    });

    it('rattrape un déblocage manqué à la consultation', async () => {
      // Le filet de sécurité du chemin best-effort côté séance : la
      // synchronisation est refaite à la lecture.
      const { service, inserted } = buildService({
        level: 5,
        sessions: [],
        beats: [beat({ id: 'p5', trigger_value: 5 })],
        unlocks: [],
      });

      const state = await service.getState(PROFILE_ID);

      expect(inserted).toHaveLength(1);
      expect(state.tracks[0].beats.map((b) => b.id)).toEqual(['p5']);
    });

    it('ne compte pas comme non lu ce qui a déjà été ouvert', async () => {
      const { service } = buildService({
        level: 1,
        sessions: [],
        beats: [
          beat({ id: 'p1', order_index: 1 }),
          beat({ id: 'p2', order_index: 2 }),
        ],
        unlocks: [
          {
            profile_id: PROFILE_ID,
            beat_id: 'p1',
            unlocked_at: '2026-08-10T09:00:00.000Z',
            read_at: '2026-08-10T09:05:00.000Z',
          },
        ],
      });

      const state = await service.getState(PROFILE_ID);

      expect(state.unreadCount).toBe(1);
    });
  });

  describe('markBeatRead', () => {
    const fixture = (): Fixture => ({
      level: 1,
      sessions: [],
      beats: [beat({ id: 'p1' })],
      unlocks: [
        {
          profile_id: PROFILE_ID,
          beat_id: 'p1',
          unlocked_at: '2026-08-10T09:00:00.000Z',
          read_at: null,
        },
      ],
    });

    it('date la première consultation', async () => {
      const { service } = buildService(fixture());

      const unlock = await service.markBeatRead(PROFILE_ID, 'p1');

      expect(unlock.read_at).not.toBeNull();
    });

    it('garde la date de la première lecture si on rejoue l’appel', async () => {
      const { service } = buildService(fixture());

      const premiere = await service.markBeatRead(PROFILE_ID, 'p1');
      const seconde = await service.markBeatRead(PROFILE_ID, 'p1');

      expect(seconde.read_at).toBe(premiere.read_at);
    });

    it('répond 404 sur un beat non débloqué, sans dire s’il existe', async () => {
      const { service } = buildService(fixture());

      await expect(service.markBeatRead(PROFILE_ID, 'p9')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('répond 404 sur le déblocage de quelqu’un d’autre', async () => {
      // Le filtre porte sur le `profile_id` du jeton : la ligne d'autrui n'est
      // pas trouvée, donc rien ne confirme son existence.
      const autrui = '9a1d4e7c-2b3f-4a8d-8e6c-1f0b5d9a3c72';
      const { service } = buildService(fixture());

      await expect(service.markBeatRead(autrui, 'p1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
