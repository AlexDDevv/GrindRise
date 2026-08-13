import { useMemo } from 'react';

import type { Database } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import { useReferenceData } from '../../lib/useReferenceData';

export type Sport = Database['public']['Tables']['sports']['Row'];

/**
 * Catalogue des sports.
 *
 * Lecture directe via la RLS (`sports_select_public`) : c'est une table de
 * référence de quatre lignes, la faire transiter par l'API n'ajouterait qu'un
 * saut réseau. Trois écrans en dépendent — le choix de sport à l'onboarding, le
 * formulaire de log, et le dashboard qui a besoin du nom pour l'activité
 * récente —, d'où le cache de `useReferenceData`.
 *
 * `byId` évite à chaque appelant de refaire la même correspondance
 * identifiant → nom : sans elle, l'activité récente afficherait « musculation »
 * là où le catalogue dit « Musculation ».
 */
export function useSports() {
  const { rows, error, reload } = useReferenceData<Sport>(
    'sports',
    () => supabase.from('sports').select('*').order('name'),
    'Impossible de charger les sports. Vérifie ta connexion.',
  );

  const byId = useMemo(
    () => new Map((rows ?? []).map((sport) => [sport.id, sport])),
    [rows],
  );

  return { sports: rows, byId, error, reload };
}
