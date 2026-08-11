import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiRequest, ApiError } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { FIXTURE_STATE } from './fixtures';
import {
  firstUnreadBeat,
  withBeatRead,
  type NarrativeState,
  type UnlockedBeat,
} from './narrativeState';

/** D'où vient l'état affiché — le bandeau de l'écran en dépend. */
export type CodexSource = 'api' | 'fixtures';

/**
 * État du codex et règle de présentation des fragments.
 *
 * Deux façons d'ouvrir un beat, et c'est toute la logique de cet écran :
 *
 * - **non lu** : il est présenté de lui-même, en modale, à la première arrivée
 *   sur le codex. Le fermer le date (`read_at`), donc il ne se represente
 *   jamais — ni maintenant, ni au prochain lancement de l'app ;
 * - **déjà lu** : il ne s'ouvre plus que sur un appui explicite dans la liste.
 *
 * Le marquage est optimiste : l'affichage n'attend pas le serveur. Un échec
 * réseau ne doit pas coincer le joueur devant une modale qui revient, alors que
 * la conséquence d'un marquage perdu se limite à revoir un fragment une fois.
 */
export function useCodex() {
  const [state, setState] = useState<NarrativeState | null>(null);
  const [source, setSource] = useState<CodexSource>('api');
  const [error, setError] = useState<string | null>(null);
  const [presented, setPresented] = useState<UnlockedBeat | null>(null);
  const [sportNames, setSportNames] = useState<Record<string, string>>({});

  // Fragments fermés pendant cette session. Sans ça, un marquage refusé par le
  // serveur ferait revenir la même modale en boucle à chaque rechargement.
  const dismissed = useRef(new Set<string>());

  const load = useCallback(async () => {
    setError(null);

    try {
      const next = await apiRequest<NarrativeState>('/narrative');

      // Aucun beat nulle part : la table de contenu n'est pas encore remplie.
      // On bascule sur les données factices pour que le flux reste parcourable,
      // et l'écran le dit franchement. Ce repli disparaît au premier import.
      const hasContent = next.tracks.some((track) => track.beats.length > 0);

      setState(hasContent ? next : FIXTURE_STATE);
      setSource(hasContent ? 'api' : 'fixtures');
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? cause.message
          : 'Impossible de joindre le serveur.';

      console.warn('[narrative] lecture du codex impossible :', message);

      setState(FIXTURE_STATE);
      setSource('fixtures');
      setError(message);
    }
  }, []);

  // Rechargé à chaque retour sur l'onglet : une séance loggée entre-temps peut
  // avoir ouvert un fragment, et c'est l'API qui l'aura débloqué au passage.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Les noms de sports viennent de la base (lecture publique), pas de l'API :
  // l'état narratif ne transporte que des `sport_id`, et une table de quatre
  // lignes ne mérite pas d'être recopiée dans chaque réponse.
  useEffect(() => {
    void (async () => {
      const { data, error: loadError } = await supabase
        .from('sports')
        .select('id, name');

      if (loadError) {
        // Sans nom, l'écran retombe sur l'identifiant : lisible, donc pas de
        // quoi bloquer l'affichage du codex.
        console.warn('[narrative] lecture des sports impossible :', loadError.message);
        return;
      }

      setSportNames(Object.fromEntries(data.map((sport) => [sport.id, sport.name])));
    })();
  }, []);

  useEffect(() => {
    if (!state || presented) return;

    const next = firstUnreadBeat(state);
    if (next && !dismissed.current.has(next.id)) {
      setPresented(next);
    }
  }, [presented, state]);

  const markRead = useCallback(
    async (beat: UnlockedBeat) => {
      const readAt = new Date().toISOString();
      setState((current) =>
        current ? withBeatRead(current, beat.id, readAt) : current,
      );

      // Rien à écrire côté serveur pour un fragment factice : il n'existe pas.
      if (source === 'fixtures') return;

      try {
        await apiRequest(`/narrative/beats/${beat.id}/read`, { method: 'POST' });
      } catch (cause) {
        console.warn(
          '[narrative] marquage en lu impossible :',
          cause instanceof ApiError ? cause.message : cause,
        );
      }
    },
    [source],
  );

  /** Ouverture explicite depuis la liste, lu ou non. */
  const openBeat = useCallback((beat: UnlockedBeat) => {
    setPresented(beat);
  }, []);

  const closeBeat = useCallback(() => {
    if (!presented) return;

    dismissed.current.add(presented.id);
    if (presented.read_at === null) {
      void markRead(presented);
    }

    setPresented(null);
  }, [markRead, presented]);

  return {
    state,
    source,
    error,
    reload: load,
    sportNames,
    presented,
    openBeat,
    closeBeat,
  };
}
