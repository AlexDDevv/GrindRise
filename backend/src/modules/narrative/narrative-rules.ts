/**
 * Règles de déblocage narratif, en fonctions pures.
 *
 * L'invariant que ce fichier existe pour protéger :
 *
 *   **la classe du joueur n'entre nulle part dans ce calcul.** Elle est choisie
 *   une fois à la création et ne change jamais ; elle donne le ton de la trame
 *   principale, pas l'accès aux trames annexes. Une trame annexe s'ouvre parce
 *   que le joueur a loggé des séances dans ce sport, un point c'est tout.
 *
 * Concrètement : `PlayerNarrativeState` ne porte volontairement ni `class_id`
 * ni rien qui s'en approche, et aucune fonction ici n'en prend en paramètre.
 * Le jour où quelqu'un veut ajouter la classe à ce type, c'est le signe qu'un
 * besoin a été mal formulé — un triathlète garde une seule classe et débloque
 * quand même les trois trames de ses trois sports.
 *
 * Pourquoi en fonctions pures, comme le barème d'XP : ces règles décident de ce
 * que le joueur a le droit de lire, elles doivent donc être éprouvables cas par
 * cas sans Postgres. Le service ne fait que lire l'état, le leur soumettre, et
 * écrire ce qu'elles renvoient.
 */

/** Trame principale, universelle, pilotée par le niveau global. */
export const MAIN_TRACK = 'main';

/** Préfixe d'une trame annexe. Le suffixe est un `sports.id`. */
export const SPORT_TRACK_PREFIX = 'sport:';

/** Track de la trame annexe d'un sport. */
export function sportTrack(sportId: string): string {
  return `${SPORT_TRACK_PREFIX}${sportId}`;
}

export type ParsedTrack =
  { kind: 'main'; sportId: null } | { kind: 'sport'; sportId: string };

/**
 * Décompose un track.
 *
 * @returns `null` si le track ne suit aucune des deux formes — impossible en
 * base (contrainte `narrative_beats_track_trigger_coherent`), mais le type ne
 * le dit pas, et un beat mal formé doit rester invisible plutôt que faire
 * tomber le codex entier.
 */
export function parseTrack(track: string): ParsedTrack | null {
  if (track === MAIN_TRACK) return { kind: 'main', sportId: null };

  if (track.startsWith(SPORT_TRACK_PREFIX)) {
    const sportId = track.slice(SPORT_TRACK_PREFIX.length);
    return sportId === '' ? null : { kind: 'sport', sportId };
  }

  return null;
}

/**
 * Ce qu'il faut connaître d'un joueur pour décider de ses déblocages.
 *
 * La liste est exhaustive, et c'est le cœur du découplage : le niveau global
 * pour la trame principale, le compte de séances par sport pour les annexes.
 * Rien d'autre.
 */
export type PlayerNarrativeState = {
  /** `user_progress.level`. */
  level: number;
  /** Séances loggées par `sports.id`. Un sport absent vaut zéro séance. */
  sessionsBySport: Readonly<Record<string, number>>;
};

/**
 * Ce que les règles ont besoin de savoir d'un beat — un sous-ensemble de la
 * ligne `narrative_beats`, décrit en snake_case parce qu'il vient tel quel de
 * la base : une couche de correspondance n'achèterait rien ici.
 */
export type BeatTrigger = {
  track: string;
  trigger_type: string;
  trigger_value: number;
};

/**
 * Le joueur a-t-il atteint le seuil de ce beat ?
 *
 * Le `trigger_type` fait autorité sur la source de données, le `track` sur le
 * sport concerné. La base garantit déjà que les deux s'accordent ; un
 * `trigger_type` inconnu (contenu écrit plus tard, migration en cours) renvoie
 * `false` — ne rien débloquer est le seul défaut acceptable, l'inverse
 * offrirait du contenu non gagné.
 */
export function isBeatUnlocked(
  beat: BeatTrigger,
  player: PlayerNarrativeState,
): boolean {
  switch (beat.trigger_type) {
    case 'global_level':
      return player.level >= beat.trigger_value;

    case 'sport_sessions_count': {
      const parsed = parseTrack(beat.track);
      if (parsed?.kind !== 'sport') return false;

      return (
        (player.sessionsBySport[parsed.sportId] ?? 0) >= beat.trigger_value
      );
    }

    default:
      return false;
  }
}

/**
 * Beats à débloquer maintenant : seuil atteint, et pas déjà dans le log.
 *
 * Le filtre sur `alreadyUnlocked` n'est qu'une économie d'écriture, pas la
 * garantie d'unicité : celle-ci est tenue par la clé primaire composite de
 * `user_narrative_unlocks`, donc deux requêtes simultanées ne peuvent pas
 * produire de doublon même si elles calculent la même liste.
 */
export function beatsToUnlock<T extends BeatTrigger & { id: string }>(
  beats: readonly T[],
  player: PlayerNarrativeState,
  alreadyUnlocked: ReadonlySet<string>,
): T[] {
  return beats.filter(
    (beat) => !alreadyUnlocked.has(beat.id) && isBeatUnlocked(beat, player),
  );
}
