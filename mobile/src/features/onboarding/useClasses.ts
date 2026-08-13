import { useMemo } from 'react';

import type { Database } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import { useReferenceData } from '../../lib/useReferenceData';

export type GameClass = Database['public']['Tables']['classes']['Row'];

/**
 * Classes jouables.
 *
 * Lecture directe via la RLS : `classes_select_public` ouvre la table à `anon`
 * comme à `authenticated`, ce qui compte ici — l'écran de choix de classe
 * précède l'authentification, il n'y a donc pas encore de session à présenter.
 *
 * @param sportId sport de prédilection du joueur. Une classe dont `sport_id`
 *   est nul est générique et reste proposée quel que soit le sport ; les autres
 *   ne sortent que pour le leur. Aucune classe n'est spécifique aujourd'hui, le
 *   filtre ne retire donc rien — il existe pour que l'ajout d'une classe
 *   dédiée en base suffise, sans toucher au mobile.
 */
export function useClasses(sportId: string | null) {
  const { rows, error, reload } = useReferenceData<GameClass>(
    'classes',
    () => supabase.from('classes').select('*').order('name'),
    'Impossible de charger les classes. Vérifie ta connexion.',
  );

  const classes = useMemo(
    () =>
      rows?.filter(
        (gameClass) => gameClass.sport_id === null || gameClass.sport_id === sportId,
      ) ?? null,
    [rows, sportId],
  );

  return { classes, error, reload };
}
