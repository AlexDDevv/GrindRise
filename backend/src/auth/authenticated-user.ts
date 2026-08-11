/**
 * Identité extraite du JWT Supabase, posée sur la requête par
 * `SupabaseAuthGuard` et lue par `@CurrentUser()`.
 */
export type AuthenticatedUser = {
  /**
   * UUID de `auth.users.id`.
   *
   * `profiles.id` référence cette colonne : c'est donc directement le
   * `profile_id`, sans requête supplémentaire pour passer de l'un à l'autre.
   * C'est aussi ce qui fait fonctionner `auth.uid() = profile_id` dans les
   * policies RLS.
   */
  id: string;

  /** Nul pour les jetons émis sans email (téléphone, anonyme). */
  email: string | null;
};

/**
 * Ce que la couche auth a besoin de voir d'une requête, et rien de plus.
 *
 * Volontairement structurel plutôt qu'un `express.Request` : ni le guard ni le
 * décorateur n'ont de raison de dépendre du transport HTTP choisi, et un type
 * de trois lignes se relit plus vite qu'une augmentation globale de module.
 */
export type AuthenticatedRequest = {
  headers: { authorization?: string };
  user?: AuthenticatedUser;
};
