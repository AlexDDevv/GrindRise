/**
 * Formatage des nombres affichés.
 *
 * Le français sépare les milliers par une espace insécable — 2 450, jamais
 * 2450 ni 2,450. Passer par `Intl` plutôt que par une regex maison garde le
 * bon caractère d'espacement, celui que `tabular-nums` alignera.
 */
export const formatNumber = (value: number): string => value.toLocaleString('fr-FR');
