/**
 * Palette Grindrise — « Braise & parchemin ».
 *
 * Source de vérité : `Direction artistique.dc.html` §02 pour les couleurs
 * nommées, `Composants detail.dc.html` pour les valeurs dérivées que les
 * composants exigent (survol, désactivé, fonds de modale) et que §02 ne nomme
 * pas. Chaque valeur dérivée porte l'origine en commentaire.
 *
 * Deux règles du DA ne sont pas exprimables en token, elles se tiennent à la
 * relecture : l'or appartient à la progression (XP, niveau, action
 * principale), le rouge appartient au récit (codex, palier franchi) ; un écran
 * ne mélange jamais les deux en aplat plein.
 */

/**
 * Valeurs brutes. Rien ne les importe en dehors de ce fichier : les composants
 * passent par `colors`, dont les clés disent le rôle. Le détour permet de
 * retrouver quelle décision du DA porte quelle valeur.
 */
const palette = {
  // §02 — les deux fonds et le creux
  ember900: '#161110', // fond principal, toutes les pages
  ember800: '#1b1514', // surface : cartes, listes, champs
  ember950: '#0d0b09', // creux : pistes de jauge, fonds de champ
  ember850: '#191312', // intérieur des médaillons — Composants detail 03

  // §02 — accent de progression
  gold500: '#c08a34', // CTA, XP, niveau actif
  gold300: '#e0b26a', // or clair : chiffres d'XP
  gold700: '#8a5f21', // or sombre : dégradés
  gold200: '#e8bd6c', // fin du dégradé d'XP — Composants detail 02
  gold400: '#d69c3e', // état pressé du bouton primaire — Composants detail 01
  gold800: '#5d4116', // fin du dégradé de cadre hexagonal — Composants detail 03
  goldMuted: '#4a3a20', // bouton primaire désactivé — Composants detail 01
  gold100: '#eee1cc', // nom d'exercice sur en-tête teinté — maquette 09, comp. 08

  // §02 — accent narratif
  rust500: '#8e2f27', // codex, palier franchi
  rust300: '#e08b7d', // rouge clair : labels de lore

  // §02 — parchemin et données
  parchment100: '#f3e7d3', // titres
  parchment200: '#f0e3cd', // titres de carte et de modale
  parchment300: '#d8cbb8', // libellé de bouton secondaire — Composants detail 01
  parchmentGold: '#f3e3c4', // chiffre gravé du médaillon — Composants detail 03
  parchmentWarm: '#f6e2d3', // texte du bandeau « palier franchi » — Composants detail 05
  parchmentLit: '#f0d9c6', // libellé de bouton secondaire pressé — Composants detail 01
  white: '#ffffff', // chiffres de données, et rien d'autre

  // Encres posées sur un aplat or : ne jamais les utiliser sur fond sombre
  inkOnGold: '#1c1206', // libellé de bouton primaire — Composants detail 01
  inkOnGoldSolid: '#1d1408', // chiffre du médaillon plein — Composants detail 03
  inkOnGoldMuted: 'rgba(28, 18, 6, 0.55)', // libellé de bouton désactivé

  // Fonds de modale — Composants detail 05
  modalCeremonyTop: '#241413',
  modalQuietTop: '#1e1716',
  modalBottom: '#150f0e',

  transparent: 'transparent',
} as const;

/**
 * §02 — les quatre opacités de texte sur fond sombre, et rien d'autre.
 *
 * `Composants detail` en emploie trois de plus (40, 42, 50 %) que le §02
 * n'autorise pas ; elles sont ramenées sur le cran normé le plus proche, ce
 * qui est invisible à l'œil et rend la règle enfin vraie dans le code.
 */
const ink = {
  data: 'rgba(255, 255, 255, 1)', // 100 % — données chiffrées
  body: 'rgba(255, 255, 255, 0.68)', // 68 % — texte courant
  secondary: 'rgba(255, 255, 255, 0.45)', // 45 % — texte secondaire
  label: 'rgba(255, 255, 255, 0.32)', // 32 % — labels mono
} as const;

/**
 * Filets. Le DA n'en dessine qu'un, décliné en trois intensités selon qu'il
 * borde une surface ou un contrôle. Les six valeurs du document (9 à 18 %) se
 * ramènent à ces trois-là.
 */
const line = {
  /** Carte, modale sobre, piste de jauge, séparateur interne. */
  default: 'rgba(255, 255, 255, 0.1)',
  /** Contour d'un bouton secondaire. */
  control: 'rgba(255, 255, 255, 0.16)',
  /** Idem, posé sur une modale : un cran plus lisible sur fond dégradé. */
  controlOnModal: 'rgba(255, 255, 255, 0.18)',
} as const;

export const colors = {
  /** Fonds. `page` est le fond de tout écran, `well` uniquement un creux. */
  surface: {
    page: palette.ember900,
    raised: palette.ember800,
    well: palette.ember950,
    /** Voile posé derrière une modale — Composants detail 05. */
    scrimCenter: 'rgba(192, 138, 52, 0.14)',
    scrimEdge: 'rgba(10, 8, 8, 0.86)',
  },

  line,

  /** Texte. Les quatre premiers crans sont les opacités normées du §02. */
  text: {
    ...ink,
    /** Titres Grenze les plus forts : h1, nom de palier. */
    title: palette.parchment100,
    /** Titres de carte, titres de modale, citations de lore. */
    titleSoft: palette.parchment200,
    /** Libellé de lore accentué à l'intérieur d'une phrase. */
    lore: palette.rust300,
    /** Chiffre d'XP et labels de progression. */
    progress: palette.gold300,
  },

  /** Accents. Deux crans chacun : dire si l'on pose un aplat ou une nuance. */
  accent: {
    gold: palette.gold500,
    goldLight: palette.gold300,
    goldDark: palette.gold700,
    rust: palette.rust500,
    rustLight: palette.rust300,
  },

  /** Bouton — Composants detail 01. */
  button: {
    primaryBackground: palette.gold500,
    primaryBackgroundPressed: palette.gold400,
    primaryBackgroundDisabled: palette.goldMuted,
    primaryLabel: palette.inkOnGold,
    primaryLabelDisabled: palette.inkOnGoldMuted,
    secondaryBorderPressed: palette.rust500,
    secondaryLabel: palette.parchment300,
    secondaryLabelPressed: palette.parchmentLit,
    /** Libellé de bouton secondaire posé sur une modale. */
    onModalLabel: palette.parchment200,
    tertiaryLabel: ink.secondary,
    tertiaryLabelPressed: palette.gold300,
  },

  /** Barre d'XP — Composants detail 02. */
  xp: {
    track: palette.ember950,
    fillFrom: palette.gold700,
    fillTo: palette.gold200,
  },

  /** Médaillon de niveau — Composants detail 03. */
  medallion: {
    frameFrom: palette.gold500,
    frameTo: palette.gold800,
    /** Cadre du médaillon plein, servi au level-up : le dégradé s'inverse. */
    solidFrom: palette.gold300,
    solidTo: palette.gold700,
    frameLocked: line.default,
    core: palette.ember850,
    numeral: palette.parchmentGold,
    numeralOnSolid: palette.inkOnGoldSolid,
    caption: palette.gold500,
    lockedGlyph: ink.label,
  },

  /** Carte de séance — Composants detail 04. */
  workoutCard: {
    background: palette.ember800,
    /** En-tête teinté or : la séance appartient à la progression. */
    headerBackground: 'rgba(192, 138, 52, 0.07)',
    /** Pastille d'icône de sport, en liste compacte. */
    glyphBackground: 'rgba(224, 178, 106, 0.14)',
    glyph: palette.gold300,
    metricLabel: ink.secondary,
    metricUnit: ink.secondary,
    xpGain: palette.gold300,
    footer: ink.secondary,
  },

  /**
   * Contrôles segmentés et interrupteurs — maquette 09, composant 07.
   *
   * Le DA ne les dessinait pas : ce sont les deux contrôles que le parcours de
   * saisie d'une série exige. Ils suivent ses règles — creux pour une piste,
   * or en voile et jamais en aplat pour un état actif, pastille ronde comme
   * seule exception au « aucun radius » du §04.
   */
  control: {
    track: palette.ember950,
    trackBorder: line.control,
    /** Segment actif : un voile d'or et un liseré, jamais un aplat. */
    activeBackground: 'rgba(192, 138, 52, 0.14)',
    activeBorder: palette.gold500,
    activeLabel: palette.gold300,
    label: ink.label,
    /** Interrupteur enclenché : là, l'or est bien un aplat — c'est une action. */
    toggleOn: palette.gold500,
    toggleThumbOn: palette.inkOnGold,
    toggleThumbOff: ink.label,
  },

  /**
   * Séance de musculation — maquette 09, composants 06 et 08.
   */
  strength: {
    /** Bandeau des libellés de colonne, en retrait sous l'en-tête. */
    columnBandBackground: palette.ember900,
    /** Filet entre deux lignes de série : un cran sous le filet de carte. */
    setSeparator: line.default,
    /** Ligne en cours de saisie : voile d'or et liseré à gauche. */
    activeRowBackground: 'rgba(192, 138, 52, 0.09)',
    activeRowBar: palette.gold500,
    activeRowIndex: palette.gold300,
    /**
     * Valeur absente : le tiret cadratin et son unité s'effacent ensemble.
     * La maquette pose 24 % ; le §02 n'accorde que quatre opacités, et 32 % est
     * le cran le plus proche.
     */
    emptyValue: ink.label,
    /** Nom d'exercice sur l'en-tête teinté d'une carte de saisie. */
    exerciseName: palette.gold100,
    /** Action en ligne : « Ajouter une série ». */
    rowAction: palette.gold500,
    /** Étiquette « À MOI » d'un exercice perso. */
    ownedBorder: 'rgba(224, 178, 106, 0.45)',
    ownedLabel: palette.gold300,
  },

  /** Modale de level-up — Composants detail 05. */
  modal: {
    ceremonyBorder: palette.rust500,
    ceremonyFrom: palette.modalCeremonyTop,
    quietFrom: palette.modalQuietTop,
    to: palette.modalBottom,
    bannerCeremony: palette.rust500,
    bannerCeremonyLabel: palette.parchmentWarm,
    /** Bandeau de fragment : même rouge, posé en voile. */
    bannerQuiet: 'rgba(142, 47, 39, 0.25)',
    bannerQuietBorder: 'rgba(142, 47, 39, 0.4)',
    bannerQuietLabel: palette.rust300,
    /** Hexagone de fragment : rouge en voile, jamais en aplat. */
    fragmentGlyphBackground: 'rgba(224, 139, 125, 0.12)',
    fragmentGlyph: palette.rust300,
  },

  transparent: palette.transparent,
} as const;

export type Colors = typeof colors;
