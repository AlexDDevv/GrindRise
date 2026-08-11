import type { NarrativeState } from './narrativeState';

/**
 * Données factices du codex.
 *
 * Aucun texte narratif ici, et c'est délibéré : le contenu (titres, lore) est
 * écrit à part, selon le gabarit de `docs/grindrise-plan-narratif.md`, et sera
 * importé en base. Ces libellés disent ce qu'ils sont pour qu'on ne puisse pas
 * les confondre avec du contenu réel ni les laisser filer en production.
 *
 * Elles servent à une seule chose : parcourir le flux d'affichage — sections,
 * liste, modale du non-lu — tant que `narrative_beats` est vide. Dès qu'un beat
 * existe en base, l'API prend le relais et rien de tout ceci n'apparaît.
 */

const BEAT_TITLE = 'Titre à écrire';
const BEAT_BODY = 'Texte narratif à écrire.';

function beat(
  id: string,
  track: string,
  orderIndex: number,
  triggerValue: number,
  readAt: string | null,
) {
  const isMain = track === 'main';

  return {
    id,
    track,
    order_index: orderIndex,
    trigger_type: isMain ? 'global_level' : 'sport_sessions_count',
    trigger_value: triggerValue,
    sport_id: isMain ? null : track.slice('sport:'.length),
    title: `${BEAT_TITLE} (${id})`,
    body: BEAT_BODY,
    created_at: '2026-08-11T09:00:00.000Z',
    unlocked_at: '2026-08-11T09:00:00.000Z',
    read_at: readAt,
  };
}

/**
 * Un joueur volontairement bâtard : un sport très pratiqué, un autre à peine
 * commencé — de quoi vérifier qu'une voie sans beat débloqué s'affiche quand
 * même, et qu'un beat non lu se présente bien en modale.
 */
export const FIXTURE_STATE: NarrativeState = {
  level: 4,
  unreadCount: 2,
  tracks: [
    {
      track: 'main',
      kind: 'main',
      sportId: null,
      sessions: null,
      beats: [
        beat('main-1', 'main', 1, 1, '2026-08-10T18:00:00.000Z'),
        beat('main-2', 'main', 2, 3, null),
      ],
    },
    {
      track: 'sport:course',
      kind: 'sport',
      sportId: 'course',
      sessions: 6,
      beats: [
        beat('course-1', 'sport:course', 1, 1, '2026-08-10T18:05:00.000Z'),
        beat('course-2', 'sport:course', 2, 5, null),
      ],
    },
    {
      // Une seule séance : la voie existe, mais aucun palier n'est encore
      // tombé. C'est le cas que l'API sert explicitement.
      track: 'sport:natation',
      kind: 'sport',
      sportId: 'natation',
      sessions: 1,
      beats: [],
    },
  ],
};
