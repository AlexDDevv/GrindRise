import { useCallback, useEffect, useState } from 'react';

import { apiRequest, ApiError } from '../../lib/api';
import type { Database } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../store/userStore';

export type GameClass = Database['public']['Tables']['classes']['Row'];

/**
 * Liste les classes jouables et enregistre le choix dans `profiles.class_id`.
 *
 * La lecture ne demande pas de session : `classes_select_public` ouvre la
 * table à `anon` comme à `authenticated`. L'écriture, elle, passe par
 * `profiles_update_own` et ne peut donc toucher que sa propre ligne.
 */
export function useClassSelection() {
  const profileId = useUserStore((s) => s.session?.user.id ?? null);
  const setProfile = useUserStore((s) => s.setProfile);

  const [classes, setClasses] = useState<GameClass[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadClasses = useCallback(async () => {
    setLoadError(null);
    setClasses(null);

    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .order('name');

    if (error) {
      console.warn('[onboarding] lecture des classes impossible :', error.message);
      setLoadError('Impossible de charger les classes. Vérifie ta connexion.');
      return;
    }

    setClasses(data);
  }, []);

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  const confirmSelection = useCallback(async () => {
    if (!selectedId || !profileId) return;

    setIsSubmitting(true);
    setSubmitError(null);

    // `.select().single()` n'est pas décoratif. Un UPDATE que la RLS filtre ne
    // lève aucune erreur : il réussit en touchant zéro ligne. Sans demander la
    // ligne en retour, « pas d'erreur » se lirait à tort comme « écrit », et
    // l'utilisateur resterait bloqué sur cet écran sans le moindre message.
    // `single()` sur zéro ligne, lui, échoue.
    const { data, error } = await supabase
      .from('profiles')
      .update({ class_id: selectedId })
      .eq('id', profileId)
      .select()
      .single();

    setIsSubmitting(false);

    if (error) {
      console.warn('[onboarding] écriture de la classe impossible :', error.message);
      setSubmitError('Impossible d’enregistrer ton choix. Réessaie.');
      return;
    }

    // Le profil porte désormais une classe : le RootNavigator quitte
    // l'onboarding de lui-même.
    setProfile(data);

    // Le premier fragment narratif doit être disponible dès maintenant, pas à la
    // première séance loggée : sans cet appel, un joueur qui finit l'onboarding
    // et ouvre le codex le trouverait vide.
    //
    // Ce n'est PAS le choix de classe qui débloque quoi que ce soit — la classe
    // n'entre pas dans le calcul de déblocage. C'est simplement le moment du
    // parcours où le compte devient utilisable.
    //
    // Lancé après la bascule et sans être attendu : le retenir devant un écran
    // d'onboarding qu'il vient de terminer, sans même un indicateur puisque le
    // bouton n'est plus en cours de soumission, serait un aller-retour réseau
    // payé en attente visible. Un échec est sans conséquence, `GET /narrative`
    // resynchronise à la première ouverture du codex.
    void apiRequest('/narrative/sync', { method: 'POST' }).catch(
      (cause: unknown) => {
        console.warn(
          '[onboarding] synchronisation narrative impossible :',
          cause instanceof ApiError ? cause.message : cause,
        );
      },
    );
  }, [profileId, selectedId, setProfile]);

  return {
    classes,
    loadError,
    reloadClasses: loadClasses,
    selectedId,
    select: setSelectedId,
    isSubmitting,
    submitError,
    confirmSelection,
  };
}
