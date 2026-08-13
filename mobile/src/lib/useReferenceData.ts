import { useCallback, useEffect, useState } from 'react';

/**
 * Lecture d'une table de référence, mise en cache pour la durée de la session.
 *
 * `sports`, `classes` et `level_thresholds` ont trois propriétés communes : leur
 * lecture est publique (aucune session requise, voir les policies
 * `*_select_public`), leur contenu ne change qu'entre deux déploiements, et
 * plusieurs écrans en dépendent. Sans cache, ouvrir le dashboard, l'onglet de
 * log puis le profil relirait trois fois les mêmes cinquante paliers.
 *
 * Le cache vit dans le module et non dans un store : il n'y a rien à observer,
 * ces lignes sont constantes. `reload` le vide, ce qui rattrape le seul cas
 * gênant — un premier chargement tombé sur une coupure réseau.
 */

const cache = new Map<string, readonly unknown[]>();

/** Ce que renvoie une requête PostgREST, réduit à ce qui nous concerne. */
type QueryResult<T> = { data: T[] | null; error: { message: string } | null };

export type ReferenceData<T> = {
  /** Nul tant que la première lecture n'a pas abouti. */
  rows: readonly T[] | null;
  /** Message prêt à afficher, nul si tout va bien. */
  error: string | null;
  reload: () => void;
};

/**
 * @param key identifiant de cache. Deux appels avec la même clé partagent leurs
 *   lignes, donc la clé doit inclure tout ce qui change la requête.
 * @param query la requête, relancée à chaque `reload`.
 * @param errorMessage ce que l'utilisateur lit en cas d'échec. Le message
 *   technique de PostgREST part en console, il ne s'affiche pas.
 */
export function useReferenceData<T>(
  key: string,
  query: () => PromiseLike<QueryResult<T>>,
  errorMessage: string,
): ReferenceData<T> {
  const [rows, setRows] = useState<readonly T[] | null>(
    () => (cache.get(key) as readonly T[] | undefined) ?? null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force: boolean) => {
      const cached = cache.get(key) as readonly T[] | undefined;

      // Le cache peut avoir été rempli par un autre écran après le premier
      // rendu de celui-ci : reposer les lignes, et pas seulement renoncer à la
      // requête, sinon `rows` resterait nul indéfiniment.
      if (!force && cached) {
        setRows(cached);
        return;
      }

      setError(null);

      const { data, error: queryError } = await query();

      if (queryError || !data) {
        console.warn(`[reference] lecture de ${key} impossible :`, queryError?.message);
        setError(errorMessage);
        return;
      }

      cache.set(key, data);
      setRows(data);
    },
    // `query` est volontairement absente des dépendances : c'est une fermeture
    // recréée à chaque rendu par l'appelant, la mettre ici relancerait la
    // lecture en boucle. La clé est ce qui identifie réellement la requête.
    [key, errorMessage],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const reload = useCallback(() => {
    cache.delete(key);
    void load(true);
  }, [key, load]);

  return { rows, error, reload };
}
