import { supabase } from '../../lib/supabase';
import type { Profile, Progress } from '../../store/userStore';

export type UserContext = {
  profile: Profile;
  /** Nul si le trigger de création n'a pas encore posé la ligne. */
  progress: Progress | null;
};

/**
 * Lit le profil et la progression de l'utilisateur connecté.
 *
 * Lecture directe via la RLS, sans passer par l'API : ce sont des lectures
 * simples de ses propres lignes, exactement le cas que les policies
 * `profiles_select_own` et `user_progress_select_own` couvrent.
 *
 * Une seule requête grâce à l'embed PostgREST — la relation est 1-pour-1, et
 * la RLS s'applique aussi à la table imbriquée.
 *
 * Ne touche pas au store : le résultat est appliqué par l'appelant, en même
 * temps que la session, pour éviter un état intermédiaire visible.
 *
 * @returns `null` si la lecture a échoué. L'appelant doit traiter ce cas comme
 *   un incident, pas comme un compte sans profil : le trigger sur `auth.users`
 *   garantit que la ligne existe.
 */
export async function loadUserContext(
  userId: string,
): Promise<UserContext | null> {
  // Le filtre est redondant avec la RLS, qui ne laisserait de toute façon
  // passer que cette ligne. Il est explicite pour que `maybeSingle` reste vrai
  // même si une policy s'élargissait un jour.
  const { data, error } = await supabase
    .from('profiles')
    .select('*, user_progress(*)')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[auth] lecture du profil impossible :', error.message);
    return null;
  }

  if (!data) {
    console.warn(`[auth] aucun profil pour ${userId} — le trigger a-t-il joué ?`);
    return null;
  }

  const { user_progress: progress, ...profile } = data;
  return { profile, progress };
}
