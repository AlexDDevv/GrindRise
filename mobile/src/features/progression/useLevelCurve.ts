import { useCallback } from 'react';

import { supabase } from '../../lib/supabase';
import { useReferenceData } from '../../lib/useReferenceData';
import { levelProgress, type LevelProgress, type LevelThreshold } from './levels';

/**
 * La courbe de niveaux, et de quoi y situer un joueur.
 *
 * La courbe est du game design piloté par les données (`level_thresholds`) : la
 * rééquilibrer ne demande aucun redéploiement, donc le mobile ne peut pas la
 * porter en dur. Lecture publique, mise en cache — cinquante lignes constantes.
 *
 * `progressFor` rend `null` tant que la courbe n'est pas là : un appelant ne
 * peut donc pas afficher une jauge à partir d'une courbe vide, ce qui montrerait
 * « 0 / 0 XP » à quelqu'un qui a de l'XP.
 */
export function useLevelCurve() {
  const { rows, error, reload } = useReferenceData<LevelThreshold>(
    'level_thresholds',
    () => supabase.from('level_thresholds').select('*').order('level'),
    'Impossible de charger la courbe de progression.',
  );

  const progressFor = useCallback(
    (level: number, currentXp: number): LevelProgress | null =>
      rows ? levelProgress(rows, level, currentXp) : null,
    [rows],
  );

  return { curve: rows, progressFor, error, reload };
}
