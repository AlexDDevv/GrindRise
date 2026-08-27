import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../store/userStore';

/**
 * Le dernier jour type effectivement suivi, s'il en existe un.
 *
 * Il sert deux affichages du design : la ligne « DERNIER » de l'écran de départ,
 * et la mention « DERNIER FAIT » sur la ligne du jour dans la liste. Les deux
 * disent la même chose, donc une seule lecture.
 *
 * Lecture directe via la RLS (`workout_logs_select_own`), comme l'activité
 * récente du tableau de bord : une séance enregistrée est une ligne de
 * l'appelant, et l'API n'entre en jeu que pour *écrire* une séance, là où l'XP
 * se calcule.
 *
 * Ce n'est **pas** une suggestion du jour à faire ensuite : le modèle ne porte
 * aucun ordre de cycle, et deviner le suivant demanderait de l'inventer. C'est
 * un repère, pas une recommandation.
 *
 * @returns l'identifiant du jour type, ou `null` — aucune séance issue d'un
 *   programme, jour type supprimé depuis, ou lecture en échec. Aucun des trois
 *   ne mérite un message : la ligne disparaît, et rien d'autre.
 */
export function useLastProgramWorkout(): string | null {
  const profileId = useUserStore((s) => s.session?.user.id ?? null);
  const [workoutId, setWorkoutId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profileId) return;

    const { data, error } = await supabase
      .from('workout_logs')
      .select('program_workout_id')
      .eq('profile_id', profileId)
      // `not null` et non un filtre sur le sport : une séance libre porte la
      // colonne à nul, et c'est exactement ce qui la distingue ici.
      .not('program_workout_id', 'is', null)
      .order('performed_at', { ascending: false })
      .limit(1);

    if (error) {
      // Silencieux : cette ligne est un agrément. La faire échouer bruyamment
      // ferait porter une panne de confort par un écran qui, lui, fonctionne.
      console.warn('[programmes] dernier jour type illisible :', error.message);
      return;
    }

    setWorkoutId(data?.[0]?.program_workout_id ?? null);
  }, [profileId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return workoutId;
}
