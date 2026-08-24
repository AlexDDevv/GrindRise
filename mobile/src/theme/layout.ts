/**
 * Espacement, densité et géométrie — `Direction artistique.dc.html` §04 et §05.
 *
 * Les valeurs ne collent pas au point près à celles du DA, qui travaille en
 * 4n − 1 : elles sont arrondies au cran usuel le plus proche.
 */

/** §05 — rythme vertical. */
export const spacing = {
  /** Marge latérale d'écran. */
  screen: 20,
  /** Entre deux blocs d'un même écran. */
  block: 16,
  /** Entre deux cartes d'une même liste. */
  list: 12,
  /** Entre deux lignes d'une même carte. */
  row: 8,
  /** Retrait haut sous l'encoche, en plus de l'inset système. */
  notch: 60,
} as const;

/**
 * Rembourrages internes. Le DA distingue 14 et 15 points d'un composant à
 * l'autre : sur l'échelle, c'est le même cran, et les cartes se rembourrent
 * toutes pareil.
 */
export const padding = {
  /** Carte, quelle que soit sa densité — Composants detail 04. */
  card: { x: 16, y: 12 },
  /** Pied d'une carte détaillée, plus serré que son corps. */
  cardFooter: { x: 16, y: 8 },
  /** Bandeau d'une modale — Composants detail 05. */
  modalBanner: 10,
  /** Corps d'une modale. */
  modalBody: { x: 20, y: 24 },
  /** Bouton compact, en ligne. */
  buttonCompact: 18,
  /** Rangée dense à l'intérieur d'une carte — maquette 09, composants 06 et 08. */
  dense: { x: 12, y: 12 },
} as const;

/** Écarts internes, plus serrés que le rythme d'écran du §05. */
export const gap = {
  /** Entre l'icône, le texte et le gain d'une carte. */
  row: 12,
  /** Entre deux lignes de texte empilées, et sous le bouton d'une modale. */
  line: 4,
  /** Entre deux métriques d'une carte détaillée. */
  metrics: 20,
  /** Entre les blocs d'une modale. */
  modal: 12,
  /** Entre un surtitre et le titre qu'il annonce. */
  title: 6,
} as const;

/**
 * §05 — cibles tactiles. `minimum` est un plancher, jamais franchi : le DA
 * pose les libellés d'écart des modales comme de simples mots sans hauteur,
 * ils prennent quand même leurs 44 points.
 */
export const touchTarget = {
  /** CTA principal du dashboard et de fin de séance. */
  hero: 60,
  /** Champ de saisie du log. */
  field: 56,
  /** Ligne de liste : catalogue, exercice replié en réordonnancement. */
  row: 56,
  /** Bouton primaire standard. */
  primary: 56,
  /** Bouton secondaire : un cran sous le primaire, la bordure compensant à l'œil. */
  secondary: 52,
  /** Bouton d'une modale, où la hauteur se resserre. */
  ceremony: 48,
  /** Plancher absolu. */
  minimum: 44,
} as const;

/**
 * §04 — « Aucun border-radius dans l'app, sauf les pastilles rondes ». Le
 * token existe pour que `borderRadius: 0` soit une décision lisible et non un
 * oubli.
 */
export const radius = {
  none: 0,
  pill: 999,
} as const;

/** Épaisseur de filet. Le DA ne dessine qu'un cheveu, hors échelle. */
export const border = {
  hairline: 1,
} as const;

/**
 * §04 — hexagone gravé.
 *
 * Le DA le décrit en `clip-path`, que React Native n'a pas : les composants le
 * tracent en SVG à partir de ces fractions. La hauteur n'est pas un token mais
 * une conséquence du ratio, d'où `heightOf`.
 */
export const hexagon = {
  /** Sommets en fraction de la boîte, dans l'ordre du `clip-path` du DA. */
  points: [
    [0.5, 0],
    [1, 0.26],
    [1, 0.74],
    [0.5, 1],
    [0, 0.74],
    [0, 0.26],
  ] as ReadonlyArray<readonly [number, number]>,
  /** Hauteur = largeur × 1,1. */
  ratio: 1.1,
} as const;

export const heightOf = (width: number): number => Math.round(width * hexagon.ratio);

/**
 * Tailles de médaillon — Composants detail 03. Seules la largeur et
 * l'épaisseur du cadre sont des décisions ; la hauteur et la boîte intérieure
 * s'en déduisent, ce qui évite de tenir à la main une table de huit nombres.
 *
 * Le cadre doré n'est pas une bordure mais un second hexagone imbriqué : le DA
 * interdit explicitement de combiner bordure et découpe.
 */
const medallionFrame = {
  /** Listes. */
  s: { width: 32, frame: 2 },
  /** Dashboard. */
  m: { width: 64, frame: 4 },
  /** Profil. */
  l: { width: 96, frame: 6 },
  /** Médaillon plein de la modale de level-up : un aplat, donc pas de cadre. */
  ceremony: { width: 88, frame: 0 },
} as const;

export type MedallionSize = keyof typeof medallionFrame;

export const medallionSize = Object.fromEntries(
  Object.entries(medallionFrame).map(([key, { width, frame }]) => [
    key,
    {
      width,
      height: heightOf(width),
      inner:
        frame === 0
          ? null
          : { width: width - frame * 2, height: heightOf(width) - frame * 2 },
    },
  ]),
) as Record<MedallionSize, { width: number; height: number; inner: { width: number; height: number } | null }>;

/** Hexagone d'un fragment de codex — §07 et Composants detail 05. */
export const fragmentGlyphWidth = 80;

/**
 * §04 — coin coupé. Réservé aux boutons pleins, jamais à une carte. La valeur
 * est la longueur du biseau, appliquée en haut à gauche et en bas à droite.
 */
export const cutCorner = {
  /** Bouton pleine largeur, en écran comme en modale. */
  full: 12,
  /** Bouton compact, en ligne. */
  compact: 10,
} as const;

/**
 * Largeur maximale d'une citation de lore : elle se lit centrée sur trois
 * lignes, jamais sur toute la largeur d'une modale.
 */
export const maxWidth = {
  lore: 256,
} as const;

/** Barre d'XP — Composants detail 02. */
export const xpBar = {
  height: 8,
} as const;

/** Barre gravée dans la pastille de sport d'une carte — Composants detail 04. */
export const sportGlyph = {
  barWidth: 12,
  barHeight: 4,
} as const;

/** Losange gravé : médaillon verrouillé, et fragment de codex. */
export const diamond = {
  locked: { size: 14, stroke: 2 },
  fragment: { size: 20, stroke: 2 },
} as const;

/**
 * Ligne de série — maquette 09, composant 06.
 *
 * La grille est fixe à trois colonnes (rang, comptage, charge) pour que la
 * charge reste alignée d'une ligne à l'autre : c'est la colonne qu'on relit.
 */
export const setRow = {
  /** Colonne du rang. 22 px dans la maquette, arrondi au cran usuel. */
  indexColumn: 24,
  /** Liseré à gauche d'une ligne en cours de saisie. */
  activeBar: 2,
} as const;
