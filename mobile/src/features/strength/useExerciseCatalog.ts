import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, apiRequest } from '../../lib/api';
import type { Database } from '../../lib/database.types';
import type { MuscleGroup } from './types';

export type Exercise = Database['public']['Tables']['exercises']['Row'];

/**
 * Catalogue d'exercices : les prédéfinis de l'app plus ceux de l'appelant.
 *
 * Par l'API et non par Supabase en direct, contrairement aux tables de
 * référence : le filtre de visibilité (`created_by is null or created_by = moi`)
 * est écrit dans `ExercisesService`, et la recherche y échappe les jokers de
 * `LIKE` — sans quoi chercher « % » ramènerait tout le catalogue. Refaire ça
 * côté client dupliquerait une règle de sécurité.
 *
 * Aucun cache : le catalogue change quand l'utilisateur crée un exercice, donc
 * `useReferenceData` — pensé pour des tables constantes entre deux déploiements
 * — ne convient pas ici.
 *
 * La recherche est temporisée pour espacer les requêtes, mais c'est un compteur
 * de requêtes (`requestId`) qui empêche l'affichage dans le désordre : une
 * frappe ancienne partie sur un réseau lent peut répondre après une frappe
 * plus récente, et la temporisation seule ne s'en protège pas.
 */

/** Le temps de finir de taper avant d'interroger le serveur. */
const SEARCH_DEBOUNCE_MS = 300;

export function useExerciseCatalog() {
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  /**
   * Numéro de la dernière lecture demandée.
   *
   * La temporisation espace les requêtes, elle n'empêche pas deux réponses de
   * se croiser : une frappe ancienne partie sur un réseau lent peut revenir
   * après une frappe récente et réafficher des résultats périmés. Ce compteur
   * fait que seule la dernière lecture demandée a le droit d'écrire.
   */
  const requestId = useRef(0);

  const load = useCallback(async (motif: string, groupe: MuscleGroup | null) => {
    const id = (requestId.current += 1);

    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    // Le serveur borne `search` à 80 caractères : au-delà, il répondrait 400
    // pour une frappe involontaire.
    if (motif.trim() !== '') params.set('search', motif.trim().slice(0, 80));
    if (groupe) params.set('muscleGroup', groupe);

    const query = params.toString();

    try {
      const rows = await apiRequest<Exercise[]>(`/exercises${query ? `?${query}` : ''}`);

      // Une réponse dépassée n'écrase pas une plus récente.
      if (id === requestId.current) setExercises(rows);
    } catch (cause) {
      if (id !== requestId.current) return;

      console.warn('[strength] catalogue illisible :', messageOf(cause));
      setError(messageOf(cause));
    } finally {
      // Seule la dernière lecture éteint l'indicateur : sinon une réponse
      // dépassée le couperait alors qu'une requête est encore en vol.
      if (id === requestId.current) setIsLoading(false);
    }
  }, []);

  // Temporisée à la frappe : une requête par caractère saturerait l'API.
  useEffect(() => {
    const timer = setTimeout(() => void load(search, muscleGroup), SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [load, search, muscleGroup]);

  const reload = useCallback(
    () => void load(search, muscleGroup),
    [load, search, muscleGroup],
  );

  /**
   * Crée un exercice personnel.
   *
   * @returns l'exercice créé, ou `null` si la création a échoué — l'appelant
   *   l'ajoute alors à la séance, ce pour quoi il l'a créé.
   */
  const create = useCallback(
    async (name: string, group: MuscleGroup): Promise<Exercise | null> => {
      setIsCreating(true);
      setCreateError(null);

      try {
        const created = await apiRequest<Exercise>('/exercises', {
          method: 'POST',
          body: { name: name.trim(), muscleGroup: group },
        });

        // Posé en tête de liste : c'est celui qu'on vient de chercher en vain.
        setExercises((courant) => [created, ...(courant ?? [])]);

        return created;
      } catch (cause) {
        // Un 409 n'est pas une panne : « Vous avez déjà un exercice de ce nom »
        // est une information exploitable, et le message du serveur la porte
        // déjà. Il s'affiche sans fermer la feuille.
        console.warn('[strength] création d’exercice refusée :', messageOf(cause));
        setCreateError(messageOf(cause));

        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [],
  );

  return {
    exercises,
    isLoading,
    error,
    reload,
    search,
    setSearch,
    muscleGroup,
    setMuscleGroup,
    create,
    isCreating,
    createError,
    clearCreateError: () => setCreateError(null),
  };
}

function messageOf(cause: unknown): string {
  return cause instanceof ApiError
    ? cause.message
    : 'Impossible de joindre le serveur. Réessaie.';
}
