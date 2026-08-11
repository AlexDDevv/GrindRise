import type { Database } from '../../lib/database.types';

/**
 * Contrat de `GET /narrative`.
 *
 * Le beat garde le snake_case de la base — c'est une ligne de
 * `narrative_beats`, servie telle quelle —, l'enveloppe calculée par l'API est
 * en camelCase. Même partage que `POST /workouts`, où `progress` est une ligne
 * et `award` un calcul.
 */
export type NarrativeBeat = Database['public']['Tables']['narrative_beats']['Row'];

/** Un beat débloqué : la ligne de contenu, plus l'état de lecture du joueur. */
export type UnlockedBeat = NarrativeBeat & {
  unlocked_at: string;
  /** Null tant que le beat n'a jamais été ouvert : c'est ce qui déclenche la modale. */
  read_at: string | null;
};

export type NarrativeTrack = {
  /** `main` ou `sport:<sport_id>`. */
  track: string;
  kind: 'main' | 'sport';
  sportId: string | null;
  /** Séances loggées dans ce sport. Null pour la trame principale. */
  sessions: number | null;
  /** Uniquement les beats débloqués, dans l'ordre de lecture. */
  beats: UnlockedBeat[];
};

export type NarrativeState = {
  level: number;
  tracks: NarrativeTrack[];
  unreadCount: number;
};

/** La trame principale, si elle est là. */
export function mainTrack(state: NarrativeState): NarrativeTrack | null {
  return state.tracks.find((track) => track.kind === 'main') ?? null;
}

/**
 * Les voies à afficher : celles des sports que le joueur pratique.
 *
 * Le filtre reprend la règle produit — une voie n'existe qu'à partir d'une
 * séance loggée dans ce sport, jamais parce que la classe y correspondrait. Un
 * track qui porte déjà du contenu débloqué est gardé quoi qu'il arrive : mieux
 * vaut afficher un fragment gagné qu'un écran vide.
 */
export function sportTracks(state: NarrativeState): NarrativeTrack[] {
  return state.tracks.filter(
    (track) =>
      track.kind === 'sport' &&
      ((track.sessions ?? 0) > 0 || track.beats.length > 0),
  );
}

/** Premier beat jamais ouvert, dans l'ordre des trames puis de lecture. */
export function firstUnreadBeat(state: NarrativeState): UnlockedBeat | null {
  for (const track of state.tracks) {
    const unread = track.beats.find((beat) => beat.read_at === null);
    if (unread) return unread;
  }

  return null;
}

/** Recopie l'état en marquant un beat comme lu, sans attendre le serveur. */
export function withBeatRead(
  state: NarrativeState,
  beatId: string,
  readAt: string,
): NarrativeState {
  let changed = false;

  const tracks = state.tracks.map((track) => ({
    ...track,
    beats: track.beats.map((beat) => {
      if (beat.id !== beatId || beat.read_at !== null) return beat;

      changed = true;
      return { ...beat, read_at: readAt };
    }),
  }));

  if (!changed) return state;

  return { ...state, tracks, unreadCount: Math.max(0, state.unreadCount - 1) };
}
