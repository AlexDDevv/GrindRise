import type { Session } from '@supabase/supabase-js';
import { useEffect } from 'react';

import { isSupabaseConfigured } from '../../lib/env';
import { supabase } from '../../lib/supabase';
import { useUserStore } from '../../store/userStore';
import { loadUserContext } from './loadUserContext';

/**
 * Relit la session persistée au démarrage, suit les changements d'auth, et
 * charge le profil et la progression qui vont avec.
 *
 * Invariant tenu ici : le store ne contient jamais une session sans son
 * profil. C'est ce qui permet au `RootNavigator` de router sur `class_id` sans
 * confondre « pas encore chargé » et « pas encore choisi ».
 */
export function useAuthBootstrap() {
  const applyAuthState = useUserStore((s) => s.applyAuthState);
  const setSession = useUserStore((s) => s.setSession);
  const setHydrated = useUserStore((s) => s.setHydrated);
  const reset = useUserStore((s) => s.reset);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setHydrated(true);
      return;
    }

    let isMounted = true;

    const adoptSession = async (session: Session | null) => {
      if (!session) {
        if (isMounted) reset();
        return;
      }

      const context = await loadUserContext(session.user.id);
      if (!isMounted) return;

      if (!context) {
        // Le profil est garanti par le trigger sur `auth.users` : ne pas
        // réussir à le lire est un incident réseau, pas un compte incomplet.
        // On retombe donc sur l'écran de connexion plutôt que de router vers
        // l'onboarding avec un profil inconnu, ce qui ferait rechoisir sa
        // classe à quelqu'un qui en a déjà une. La session reste valide dans
        // AsyncStorage : le prochain lancement reconnecte tout seul.
        reset();
        return;
      }

      applyAuthState({ session, ...context });
    };

    void supabase.auth.getSession().then(({ data }) => adoptSession(data.session));

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // `INITIAL_SESSION` fait doublon avec le `getSession()` ci-dessus.
        // L'ignorer évite de lire le profil deux fois à chaque démarrage.
        if (event === 'INITIAL_SESSION') return;

        // Rafraîchissement de jeton : même utilisateur, profil inchangé. On
        // met le jeton à jour sans relire la base — ce qui arrive toutes les
        // heures et servira à appeler l'API en phase 2. La garde sur `profile`
        // préserve l'invariant si un refresh précédait le chargement initial.
        if (event === 'TOKEN_REFRESHED') {
          if (session && useUserStore.getState().profile) setSession(session);
          return;
        }

        // Le callback s'exécute en tenant un verrou interne de supabase-js :
        // rappeler le client depuis la même pile peut interbloquer. Rendre la
        // main avant de relire la base est la parade recommandée.
        setTimeout(() => void adoptSession(session), 0);
      },
    );

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [applyAuthState, setSession, setHydrated, reset]);
}
