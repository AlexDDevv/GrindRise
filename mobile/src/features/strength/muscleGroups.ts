import type { MuscleGroup } from './types';

/**
 * Miroir de l'enum Postgres `muscle_group`.
 *
 * `satisfies` fait échouer la compilation si une valeur écrite ici n'existe pas
 * en base — ce que `as const` seul ne verrait pas. Il ne détecte pas l'inverse
 * (une valeur de l'enum oubliée ici), mais ce cas se voit : le groupe manquant
 * ne serait tout simplement jamais proposé. Jumeau de `MUSCLE_GROUPS` côté
 * backend, pour la même raison que `sportMetrics.ts` l'est de `xp-rules.ts`.
 */
export const MUSCLE_GROUPS = [
  'pectoraux',
  'dos',
  'epaules',
  'biceps',
  'triceps',
  'avant_bras',
  'quadriceps',
  'ischios',
  'fessiers',
  'mollets',
  'abdominaux',
  'full_body',
] as const satisfies readonly MuscleGroup[];

/**
 * Libellé affiché.
 *
 * Une table et non une transformation de la chaîne : l'enum est en ASCII
 * `snake_case` — c'est ce que Postgres accepte — alors que l'écran affiche des
 * accents et une périphrase (`full_body` → « corps entier »). Aucune règle
 * mécanique ne produit ça.
 */
const LABELS: Record<MuscleGroup, string> = {
  pectoraux: 'Pectoraux',
  dos: 'Dos',
  epaules: 'Épaules',
  biceps: 'Biceps',
  triceps: 'Triceps',
  avant_bras: 'Avant-bras',
  quadriceps: 'Quadriceps',
  ischios: 'Ischios',
  fessiers: 'Fessiers',
  mollets: 'Mollets',
  abdominaux: 'Abdominaux',
  full_body: 'Corps entier',
};

export function muscleGroupLabel(group: MuscleGroup): string {
  return LABELS[group];
}
