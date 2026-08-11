import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { Database } from '../../database.types';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  beatsToUnlock,
  MAIN_TRACK,
  parseTrack,
  sportTrack,
  type PlayerNarrativeState,
} from './narrative-rules';

export type NarrativeBeat =
  Database['public']['Tables']['narrative_beats']['Row'];
type UnlockRow = Database['public']['Tables']['user_narrative_unlocks']['Row'];

/** Un beat débloqué, avec l'état de lecture qui décide de sa présentation. */
export type UnlockedBeat = NarrativeBeat & {
  unlocked_at: string;
  read_at: string | null;
};

export type NarrativeTrackView = {
  /** `main` ou `sport:<sport_id>`. */
  track: string;
  kind: 'main' | 'sport';
  /** Nul pour la trame principale. */
  sportId: string | null;
  /**
   * Séances loggées dans ce sport, nul pour la trame principale. C'est ce qui
   * permet au mobile d'afficher une voie commencée mais dont le premier beat
   * n'est pas encore atteint, sans avoir à recompter lui-même.
   */
  sessions: number | null;
  /** Uniquement les beats débloqués, dans l'ordre de lecture. */
  beats: UnlockedBeat[];
};

export type NarrativeState = {
  /** Niveau global au moment du calcul : ce qui pilote la trame principale. */
  level: number;
  tracks: NarrativeTrackView[];
  /** Beats débloqués jamais ouverts — ceux que le mobile présente en popup. */
  unreadCount: number;
};

/** Vue interne d'une synchronisation, partagée par les deux entrées publiques. */
type SyncOutcome = {
  player: PlayerNarrativeState;
  beats: NarrativeBeat[];
  unlocks: UnlockRow[];
  /** Beats débloqués par cet appel précis. */
  unlockedNow: NarrativeBeat[];
};

/**
 * Trames narratives et leur déblocage.
 *
 * Ce module se greffe sur la progression, il ne la modifie jamais : il lit
 * `user_progress.level` et `workout_logs`, et n'écrit que dans
 * `user_narrative_unlocks`. Le calcul d'XP ignore jusqu'à son existence.
 *
 * Invariants :
 * - un déblocage est un événement explicite, jamais déduit à l'affichage —
 *   même logique que `xp_events`, sinon `unlocked_at` ne voudrait rien dire et
 *   « jamais vu » deviendrait indiscernable de « déjà lu » ;
 * - la classe du joueur n'intervient pas (voir `narrative-rules.ts`) ;
 * - la synchronisation est rejouable : elle ne fait qu'ajouter ce qui manque,
 *   donc deux exécutions successives donnent le même état.
 */
@Injectable()
export class NarrativeService {
  private readonly logger = new Logger(NarrativeService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Rattrape les déblocages en retard après un événement de progression.
   *
   * À appeler après tout ce qui peut faire bouger les deux sources de
   * déclenchement : une séance enregistrée (qui change le compte du sport ET,
   * via l'XP, le niveau global).
   *
   * @param knownLevel niveau déjà connu de l'appelant, pour éviter de relire
   * `user_progress` : la valeur qui sort de la transaction d'octroi d'XP est
   * plus fraîche que celle qu'une relecture ramènerait.
   * @returns les beats débloqués par cet appel, vide si rien n'a bougé.
   */
  async syncUnlocks(
    profileId: string,
    knownLevel?: number,
  ): Promise<NarrativeBeat[]> {
    const { unlockedNow } = await this.synchronize(profileId, knownLevel);
    return unlockedNow;
  }

  /**
   * État narratif complet d'un profil, pour l'écran codex.
   *
   * La synchronisation est refaite à la lecture, et pas seulement à l'écriture
   * d'une séance : c'est le filet de sécurité du chemin d'appel best-effort
   * côté `WorkoutsService`. Un déblocage manqué se rattrape donc à la
   * consultation suivante, sans intervention.
   */
  async getState(profileId: string): Promise<NarrativeState> {
    const { player, beats, unlocks } = await this.synchronize(profileId);

    const unlockedAt = new Map(unlocks.map((row) => [row.beat_id, row]));

    // Un track apparaît s'il porte au moins un beat débloqué, ou si le joueur
    // pratique le sport — c'est la deuxième moitié qui permet à une voie
    // commencée de s'afficher avant son premier palier.
    const tracks = new Set<string>([MAIN_TRACK]);
    for (const sportId of Object.keys(player.sessionsBySport)) {
      tracks.add(sportTrack(sportId));
    }
    for (const beat of beats) {
      if (unlockedAt.has(beat.id)) tracks.add(beat.track);
    }

    const views = [...tracks]
      .map((track): NarrativeTrackView | null => {
        const parsed = parseTrack(track);
        if (!parsed) return null;

        return {
          track,
          kind: parsed.kind,
          sportId: parsed.sportId,
          sessions:
            parsed.kind === 'sport'
              ? (player.sessionsBySport[parsed.sportId] ?? 0)
              : null,
          beats: beats
            .filter((beat) => beat.track === track && unlockedAt.has(beat.id))
            .sort((a, b) => a.order_index - b.order_index)
            .map((beat) => {
              const unlock = unlockedAt.get(beat.id)!;
              return {
                ...beat,
                unlocked_at: unlock.unlocked_at,
                read_at: unlock.read_at,
              };
            }),
        };
      })
      .filter((view): view is NarrativeTrackView => view !== null);

    return {
      level: player.level,
      // Trame principale d'abord, puis les voies les plus pratiquées : l'ordre
      // est déterministe, le mobile n'a rien à retrier.
      tracks: views.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'main' ? -1 : 1;
        if (a.sessions !== b.sessions)
          return (b.sessions ?? 0) - (a.sessions ?? 0);
        return a.track.localeCompare(b.track);
      }),
      unreadCount: unlocks.filter((row) => row.read_at === null).length,
    };
  }

  /**
   * Marque un beat comme lu, pour qu'il ne soit plus présenté en popup.
   *
   * Le filtre porte sur le `profile_id` issu du JWT : un beat débloqué par
   * quelqu'un d'autre n'est simplement pas trouvé, donc 404 plutôt que 403 —
   * répondre « interdit » confirmerait l'existence de la ligne.
   *
   * Idempotent : `read_at` garde l'horodatage de la PREMIÈRE consultation. Le
   * réécrire à chaque ouverture ferait perdre la seule donnée intéressante de
   * cette colonne.
   */
  async markBeatRead(profileId: string, beatId: string): Promise<UnlockRow> {
    const { data: existing, error: readError } = await this.supabase.client
      .from('user_narrative_unlocks')
      .select('*')
      .eq('profile_id', profileId)
      .eq('beat_id', beatId)
      .maybeSingle();

    if (readError) {
      this.logger.error(
        `Lecture du déblocage ${beatId} pour ${profileId} échouée : ${readError.message}`,
      );
      throw new InternalServerErrorException(
        'Impossible de lire ce fragment narratif.',
      );
    }

    if (!existing) {
      throw new NotFoundException("Ce fragment n'est pas débloqué.");
    }

    if (existing.read_at !== null) return existing;

    const { data, error } = await this.supabase.client
      .from('user_narrative_unlocks')
      .update({ read_at: new Date().toISOString() })
      .eq('profile_id', profileId)
      .eq('beat_id', beatId)
      // La ligne en retour, comme partout ailleurs : un UPDATE filtré qui ne
      // touche rien réussit à vide, « pas d'erreur » ne vaut pas « écrit ».
      .select()
      .single();

    if (error) {
      this.logger.error(
        `Marquage en lu de ${beatId} pour ${profileId} échoué : ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Impossible de marquer ce fragment comme lu.',
      );
    }

    return data;
  }

  /**
   * Cœur commun : lit l'état, en déduit les déblocages manquants, les écrit.
   *
   * Une seule implémentation pour les deux entrées publiques, sinon la lecture
   * et l'écriture finiraient par diverger sur ce qui compte comme débloqué.
   */
  private async synchronize(
    profileId: string,
    knownLevel?: number,
  ): Promise<SyncOutcome> {
    const [player, beats, unlocks] = await Promise.all([
      this.readPlayerState(profileId, knownLevel),
      this.readBeats(),
      this.readUnlocks(profileId),
    ]);

    const missing = beatsToUnlock(
      beats,
      player,
      new Set(unlocks.map((row) => row.beat_id)),
    );

    if (missing.length === 0) {
      return { player, beats, unlocks, unlockedNow: [] };
    }

    const insertedIds = await this.insertUnlocks(profileId, missing);

    return {
      player,
      beats,
      // Relu plutôt que reconstitué en mémoire : `unlocked_at` vient de la base,
      // et un déblocage concurrent porte l'horodatage de l'autre requête.
      unlocks: await this.readUnlocks(profileId),
      unlockedNow: missing.filter((beat) => insertedIds.has(beat.id)),
    };
  }

  /** Niveau global et séances par sport — les deux seules sources de trigger. */
  private async readPlayerState(
    profileId: string,
    knownLevel?: number,
  ): Promise<PlayerNarrativeState> {
    const [level, sessionsBySport] = await Promise.all([
      knownLevel === undefined ? this.readLevel(profileId) : knownLevel,
      this.readSessionsBySport(profileId),
    ]);

    return { level, sessionsBySport };
  }

  private async readLevel(profileId: string): Promise<number> {
    const { data, error } = await this.supabase.client
      .from('user_progress')
      .select('level')
      .eq('profile_id', profileId)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `Lecture du niveau échouée pour ${profileId} : ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Impossible de lire la progression.',
      );
    }

    // Pas de ligne : le trigger de création la garantit, mais un profil neuf
    // vaut niveau 1 — refuser ici priverait de codex un compte parfaitement
    // valide pour une raison qui ne le concerne pas.
    return data?.level ?? 1;
  }

  private async readSessionsBySport(
    profileId: string,
  ): Promise<Record<string, number>> {
    // Un GROUP BY que PostgREST ne sait pas écrire, d'où la RPC. Elle compte,
    // elle ne décide pas : les seuils restent dans `narrative-rules.ts`.
    const { data, error } = await this.supabase.client.rpc(
      'count_workouts_by_sport',
      { p_profile_id: profileId },
    );

    if (error) {
      this.logger.error(
        `Comptage des séances par sport échoué pour ${profileId} : ${error.message}`,
      );
      throw new InternalServerErrorException(
        "Impossible de lire l'historique des séances.",
      );
    }

    return Object.fromEntries(data.map((row) => [row.sport_id, row.sessions]));
  }

  private async readBeats(): Promise<NarrativeBeat[]> {
    const { data, error } = await this.supabase.client
      .from('narrative_beats')
      .select('*')
      .order('track')
      .order('order_index');

    if (error) {
      this.logger.error(`Lecture des beats échouée : ${error.message}`);
      throw new InternalServerErrorException(
        'Impossible de lire le contenu narratif.',
      );
    }

    return data;
  }

  private async readUnlocks(profileId: string): Promise<UnlockRow[]> {
    const { data, error } = await this.supabase.client
      .from('user_narrative_unlocks')
      .select('*')
      .eq('profile_id', profileId);

    if (error) {
      this.logger.error(
        `Lecture des déblocages échouée pour ${profileId} : ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Impossible de lire les fragments débloqués.',
      );
    }

    return data;
  }

  /**
   * Écrit les déblocages manquants.
   *
   * @returns les identifiants réellement insérés. Le conflit est ignoré plutôt
   * que traité en erreur : deux requêtes concurrentes peuvent calculer la même
   * liste, et « déjà débloqué » n'est pas un incident. Distinguer les deux cas
   * évite d'annoncer deux fois le même beat comme nouveau.
   */
  private async insertUnlocks(
    profileId: string,
    beats: readonly NarrativeBeat[],
  ): Promise<Set<string>> {
    const { data, error } = await this.supabase.client
      .from('user_narrative_unlocks')
      .upsert(
        beats.map((beat) => ({ profile_id: profileId, beat_id: beat.id })),
        { onConflict: 'profile_id,beat_id', ignoreDuplicates: true },
      )
      .select('beat_id');

    if (error) {
      this.logger.error(
        `Écriture des déblocages échouée pour ${profileId} : ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Impossible de débloquer les fragments narratifs.',
      );
    }

    return new Set(data.map((row) => row.beat_id));
  }
}
