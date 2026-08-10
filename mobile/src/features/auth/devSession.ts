import type { Session } from '@supabase/supabase-js';

import { useUserStore } from '../../store/userStore';

/**
 * Raccourci de développement : injecte une fausse session pour parcourir la
 * navigation tant que l'écran de connexion réel n'existe pas.
 *
 * À SUPPRIMER une fois l'auth Supabase branchée.
 */
export function signInAsDev() {
  const fakeSession = {
    access_token: 'dev',
    refresh_token: 'dev',
    token_type: 'bearer',
    expires_in: 3600,
    user: { id: 'dev-user' },
  } as unknown as Session;

  useUserStore.getState().setSession(fakeSession);
}
