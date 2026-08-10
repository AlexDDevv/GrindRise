import { useEffect } from 'react';

import { isSupabaseConfigured } from '../../lib/env';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../store/userStore';

/**
 * Relit la session persistée au démarrage et suit les changements d'auth.
 *
 * Le chargement du profil et de la progression (`profiles`, `user_progress`)
 * viendra s'ajouter ici une fois les tables créées.
 */
export function useAuthBootstrap() {
  const setSession = useUserStore((s) => s.setSession);
  const setHydrated = useUserStore((s) => s.setHydrated);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setHydrated(true);
      return;
    }

    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setHydrated(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [setSession, setHydrated]);
}
