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
  /**
   * Bandeau des libellés de colonne, plus serré que la rangée qu'il surplombe —
   * maquette 09, composant 08. Un jeton nommé plutôt qu'une division posée dans
   * le composant : le thème est le seul endroit où une dimension se décide.
   */
  columnBand: { x: 12, y: 8 },
  /**
   * Pas de rembourrage. Même raison d'être que `radius.none` et `border.none` :
   * rendre le zéro lisible comme une décision. Ici, c'est la boîte enveloppante
   * qui porte le rembourrage ; le cumuler décalerait ce qu'elle contient.
   */
  none: 0,
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
  /**
   * Pas de filet. Même raison d'être que `radius.none` : rendre le zéro lisible
   * comme une décision. Ici, c'est la boîte enveloppante qui porte le filet.
   */
  none: 0,
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
  /**
   * Boîte de confirmation — maquette 10, écran Ⓒ.
   *
   * Plus étroite que la modale de palier, qui prend toute la gouttière : une
   * question fermée se lit d'un coup d'œil, et l'élargir donnerait à une
   * suppression la solennité d'une cérémonie.
   */
  dialog: 300,
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
 * Interrupteur — maquette 09, composant 07.
 *
 * Le DA dessine 42 × 22 avec un curseur de 18 ; l'échelle retient 44 × 24 et un
 * curseur de 20, les crans usuels les plus proches. L'arithmétique reste exacte
 * — `24 − 2 × 2 = 20` — et le composant n'a plus aucune dimension en propre.
 */
export const toggle = {
  track: { width: 44, height: 24 },
  thumb: 20,
  inset: 2,
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

/**
 * Liste réordonnable par glisser — maquette 09, écran ⑦.
 *
 * Le seuil est une distance à l'écran, donc une dimension : il vit ici comme le
 * reste, et pas en nombre nu dans une condition de `PanResponder`.
 */
export const reorder = {
  /**
   * Déplacement vertical minimal avant que le glisser ne prenne le geste.
   *
   * Sous ce seuil, le tremblement d'un doigt posé sur la poignée armerait un
   * déplacement que personne n'a demandé ; un cran au-dessus, c'est le
   * `ScrollView` parent qui aurait le temps de reconnaître un défilement.
   */
  dragThreshold: 2,
  /**
   * Bande, à chaque bord de la zone visible, où le glisser fait défiler la
   * liste tout seul.
   *
   * Un cran au-dessus d'une ligne : le doigt doit pouvoir y entrer franchement
   * sans que la dernière ligne atteignable devienne inaccessible.
   */
  edgeBand: 72,
  /**
   * Défilement automatique maximal, en points **par seconde**, atteint quand le
   * doigt touche le bord. La vitesse croît sur toute la bande, sans quoi le
   * défilement démarrerait d'un coup.
   *
   * Par seconde et non par image : le glisser tourne en thread JS, qui perd des
   * images dès que la liste se redessine. Compté par image, le défilement
   * ralentissait exactement quand il servait le plus.
   */
  edgeSpeed: 800,
  /**
   * Ressort des lignes qui s'écartent pour laisser la place.
   *
   * Assez raide pour que la place soit faite avant que le doigt n'y arrive, assez
   * amorti pour ne pas rebondir : une liste qui oscille se lit mal, et le geste
   * est déjà en cours pendant que le ressort joue.
   */
  shiftSpring: { stiffness: 260, damping: 28, mass: 1 },
  /**
   * Grossissement de la ligne saisie — elle « flotte », dit la maquette ⑦.
   *
   * Deux pour cent, et pas davantage : la ligne prend toute la largeur, si bien
   * qu'un pour cent de plus se lit déjà comme une vingtaine de points qui
   * débordent. C'est le geste de la lever qui doit se voir, pas la taille.
   */
  liftScale: 1.02,
  /**
   * Ressort de la levée, et de la repose au relâchement.
   *
   * Plus vif que celui du décalage : attraper un objet est instantané, alors
   * que la place se fait pendant qu'on le déplace.
   */
  liftSpring: { stiffness: 320, damping: 24, mass: 1 },
} as const;

/**
 * Carte d'un programme — maquette 10, écran ⑥′.
 *
 * Trois niveaux dans une seule carte : le programme en en-tête, ses jours types
 * en lignes, la création en pied. La géométrie est propre à cet assemblage et
 * n'a d'équivalent nulle part ailleurs dans l'échelle.
 */
export const programCard = {
  /**
   * Colonne « DÉMARRER », à droite de chaque jour.
   *
   * 74 points de large sur toute la hauteur de la ligne : assez pour que le
   * départ soit une cible franche, assez étroit pour que le nom du jour reste
   * le corps de la ligne. C'est ce qui remplace le bouton unique du pied, qui
   * figeait un jour arbitraire.
   */
  startColumn: 74,
  /** Ligne d'action en pied de carte : « Ajouter un jour type ». */
  actionRow: 48,
  /** Un point du menu de trois points. */
  menuDot: 3,
  /** Écart entre deux points du menu. */
  menuDotGap: 3,
  /**
   * Débord tactile du menu, de chaque côté.
   *
   * Les trois points ne font que trois points de large : à dix-huit de débord,
   * la cible tombait à trente-neuf, sous le plancher de `touchTarget.minimum`,
   * et le menu se manquait au doigt. Vingt-quatre la portent à cinquante et un
   * dans les deux sens — au-dessus du plancher, et sans écarter d'un pixel le
   * compte de jours qui précède les points.
   */
  menuHitSlop: 24,
} as const;

/**
 * Ligne d'exercice du catalogue — maquette 09, écrans ④ et ⑦.
 *
 * Poignée de réordonnancement (trois filets) et étiquette « À MOI » : deux
 * géométries propres à `ExerciseListItem`, sans équivalent dans le reste de
 * l'échelle.
 */
export const exerciseRow = {
  /** Un filet de la poignée de glisser. */
  gripBar: { width: 12, height: 2 },
  /** Écart entre deux filets de la poignée. */
  gripGap: 3,
  /**
   * Débord tactile de la poignée, de chaque côté.
   *
   * Les trois filets font douze points de côté, et les grossir écarterait le
   * texte de la ligne : le débord porte la cible aux quarante-quatre points de
   * `touchTarget.minimum` sans rien déplacer.
   */
  gripHitSlop: 16,
  /** Rembourrage vertical de l'étiquette « À MOI ». */
  ownedBadgeY: 2,
} as const;
