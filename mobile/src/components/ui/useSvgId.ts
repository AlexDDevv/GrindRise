import { useId } from 'react';

/**
 * Identifiant unique utilisable dans un `url(#…)` de SVG.
 *
 * Une fois rendus sur le web, les `<defs>` de tous les SVG de la page
 * partagent un même espace de noms : deux médaillons côte à côte se voleraient
 * leur dégradé si l'identifiant était constant. `useId` garantit l'unicité,
 * mais produit des caractères qu'un identifiant XML n'accepte pas.
 */
export function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}
