import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { env, isSupabaseConfigured } from './env';

/**
 * Client Supabase côté mobile (clé `anon`).
 *
 * Ce client est soumis à la RLS : il ne peut lire/écrire que ce que les
 * policies autorisent pour l'utilisateur connecté. Les écritures sensibles
 * (`xp_events`, `user_progress`, `entitlements`) ne passent jamais par ici,
 * elles sont faites par l'API NestJS avec la clé `service_role`.
 *
 * Les valeurs de repli n'existent que pour laisser le squelette démarrer sans
 * `.env` ; `isSupabaseConfigured` reste la garde à tester avant tout appel.
 */
export const supabase = createClient(
  env.supabaseUrl || 'https://placeholder.supabase.co',
  env.supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Pas de redirection OAuth via URL du navigateur en React Native.
      detectSessionInUrl: false,
    },
  },
);

// Ne rafraîchit le token que quand l'app est au premier plan (recommandation
// Supabase pour React Native : évite les refresh en tâche de fond).
if (isSupabaseConfigured) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
