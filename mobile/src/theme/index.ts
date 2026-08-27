/**
 * Thème Grindrise — « Braise & parchemin ».
 *
 * Source de vérité : le projet Claude Design `Direction artistique.dc.html`
 * (tokens, règles) et `Composants detail.dc.html` (valeurs exactes des cinq
 * composants prioritaires). Le brief `grindrise-design-brief.md` est une
 * direction de départ, il ne fait plus foi.
 *
 * Deux règles d'usage :
 *   — aucune couleur, taille de police, marge ni rayon en dur ailleurs dans
 *     l'app ; si un composant a besoin d'une valeur absente, c'est le thème
 *     qu'on complète, après vérification dans le DA ;
 *   — toute dimension suit l'échelle Tailwind (voir `layout.ts`).
 */

export { colors } from './colors';
export type { Colors } from './colors';

export { typography, fontFamily } from './typography';
export type { Typography } from './typography';

export {
  spacing,
  padding,
  gap,
  touchTarget,
  radius,
  border,
  maxWidth,
  hexagon,
  heightOf,
  medallionSize,
  fragmentGlyphWidth,
  cutCorner,
  xpBar,
  sportGlyph,
  diamond,
  toggle,
  setRow,
  exerciseRow,
  programCard,
  reorder,
} from './layout';
export type { MedallionSize } from './layout';

export { glow, shadow, scrim, gradient } from './effects';

export { useAppFonts } from './fonts';
