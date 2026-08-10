/**
 * Variables d'environnement exposées au bundle client.
 *
 * Expo n'inline que les variables préfixées `EXPO_PUBLIC_` (lues depuis `.env`
 * à la compilation). Tout ce qui est ici finit donc DANS l'app livrée :
 * n'y mettre que des secrets publics (la clé `anon` de Supabase en est un,
 * elle est protégée par la RLS). La clé `service_role` reste côté backend.
 *
 * Note : `process.env.X` doit être écrit littéralement, Expo remplace le texte
 * au build — un accès dynamique (`process.env[name]`) ne serait pas substitué.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Faux tant que `.env` n'est pas renseigné. Le squelette reste lançable dans ce
 * cas (aucun appel réseau n'est tenté), il suffit de renseigner les valeurs et
 * de relancer avec `npx expo start -c` pour vider le cache Metro.
 */
export const isSupabaseConfigured = supabaseUrl !== '' && supabaseAnonKey !== '';

if (!isSupabaseConfigured) {
  console.warn(
    '[env] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY absents. ' +
      'Copiez .env.example vers .env — les appels Supabase sont désactivés en attendant.',
  );
}

export const env = {
  supabaseUrl,
  supabaseAnonKey,
};
