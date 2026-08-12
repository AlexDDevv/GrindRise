import type { TextStyle } from 'react-native';

import { colors } from './colors';

/**
 * Typographie Grindrise — `Direction artistique.dc.html` §03.
 *
 * Trois familles, trois rôles stricts :
 *   Grenze         titres, noms de palier, lore        — jamais un chiffre
 *   IBM Plex Sans  interface, données, boutons         — tabular-nums sur les chiffres
 *   JetBrains Mono labels, états, méta, en capitales   — jamais une phrase
 *
 * Deux règles de mise en œuvre, invisibles dans le DA :
 *   — le poids se porte par la famille et jamais par `fontWeight`, sinon
 *     Android synthétise un faux gras par-dessus une police déjà grasse ;
 *   — les tailles sont arrondies au cran usuel le plus proche, ce qui déplace
 *     certains crans du DA de un ou deux points.
 */

/**
 * Paires taille / interligne. Un style qui a besoin de plus d'air — une
 * citation, un paragraphe — surcharge `lineHeight` en le disant.
 */
const text = {
  10: { fontSize: 10, lineHeight: 12 },
  12: { fontSize: 12, lineHeight: 16 },
  14: { fontSize: 14, lineHeight: 20 },
  16: { fontSize: 16, lineHeight: 24 },
  18: { fontSize: 18, lineHeight: 24 },
  20: { fontSize: 20, lineHeight: 28 },
  24: { fontSize: 24, lineHeight: 32 },
  28: { fontSize: 28, lineHeight: 32 },
  30: { fontSize: 30, lineHeight: 32 },
  36: { fontSize: 36, lineHeight: 40 },
} as const;

/**
 * Le DA écrit l'interlettrage en `em`, React Native l'attend en points.
 * `tracking(10, 0.16)` rend le `letter-spacing: .16em` d'un texte de 10 px.
 */
const tracking = (fontSize: number, em: number): number =>
  Math.round(fontSize * em * 100) / 100;

/** Familles telles que `useAppFonts` les enregistre. Voir `fonts.ts`. */
export const fontFamily = {
  displayRegular: 'Grenze_400Regular',
  displayBold: 'Grenze_700Bold',
  sansRegular: 'IBMPlexSans_400Regular',
  sansMedium: 'IBMPlexSans_500Medium',
  sansSemiBold: 'IBMPlexSans_600SemiBold',
  sansBold: 'IBMPlexSans_700Bold',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

/** Les chiffres s'alignent en colonne partout — §03, règle sans exception. */
const tabular: Pick<TextStyle, 'fontVariant'> = { fontVariant: ['tabular-nums'] };

/** Grenze. §03 : h1, titre de carte, citation de lore — jamais un chiffre. */
const display = {
  /** Titre d'écran. */
  hero: { ...text[30], fontFamily: fontFamily.displayBold, color: colors.text.title },
  /** Nom du palier dans la modale de level-up. */
  ceremony: { ...text[28], fontFamily: fontFamily.displayBold, color: colors.text.title },
  /** Titre d'un fragment débloqué. */
  fragment: { ...text[24], fontFamily: fontFamily.displayBold, color: colors.text.titleSoft },
  /** Titre d'une carte détaillée. */
  cardTitle: { ...text[20], fontFamily: fontFamily.displayBold, color: colors.text.titleSoft },
  /** Titre d'une carte en liste compacte. */
  cardTitleCompact: {
    ...text[18],
    fontFamily: fontFamily.displayBold,
    color: colors.text.titleSoft,
  },
  /** Citation de lore. Interligne ouvert : elle se lit, elle ne s'annonce pas. */
  lore: {
    ...text[14],
    lineHeight: 24,
    fontFamily: fontFamily.displayRegular,
    color: colors.text.titleSoft,
  },
} as const;

/** IBM Plex Sans. §03 : boutons, métriques, texte courant. */
const sans = {
  /** Libellé de bouton primaire. */
  button: { ...text[16], fontFamily: fontFamily.sansBold },
  /** Libellé de bouton secondaire. */
  buttonSecondary: { ...text[14], fontFamily: fontFamily.sansSemiBold },
  /** Libellé de bouton compact, en ligne. */
  buttonCompact: { ...text[14], fontFamily: fontFamily.sansBold },
  /** Libellé de bouton tertiaire, sans fond ni contour. */
  buttonTertiary: { ...text[14], fontFamily: fontFamily.sansMedium },

  /** Chiffre héros : volume total, record. */
  metricHero: {
    ...text[36],
    fontFamily: fontFamily.sansBold,
    color: colors.text.data,
    ...tabular,
  },
  /** Métrique d'une carte détaillée. */
  metric: { ...text[20], fontFamily: fontFamily.sansSemiBold, color: colors.text.data, ...tabular },
  /** Compteur d'XP au-dessus d'une jauge. */
  metricInline: {
    ...text[14],
    fontFamily: fontFamily.sansSemiBold,
    color: colors.text.data,
    ...tabular,
  },
  /** Gain d'XP d'une séance, libellé ou non. */
  metricGain: { ...text[14], fontFamily: fontFamily.sansBold, ...tabular },
  /** Unité accolée à une métrique — Composants detail 04. */
  unit: { ...text[12], fontFamily: fontFamily.sansRegular, color: colors.workoutCard.metricUnit },

  /** Texte courant. */
  body: { ...text[16], fontFamily: fontFamily.sansRegular, color: colors.text.body },
  /** Texte courant dense : conseil, explication sous un titre. */
  bodySmall: { ...text[14], fontFamily: fontFamily.sansRegular, color: colors.text.body },
  /** Méta d'une carte : date, durée, volume résumé. */
  caption: {
    ...text[12],
    fontFamily: fontFamily.sansRegular,
    color: colors.text.secondary,
    ...tabular,
  },
  /** Légende sous une jauge, pied de carte. */
  captionSmall: {
    ...text[10],
    fontFamily: fontFamily.sansRegular,
    color: colors.text.secondary,
    ...tabular,
  },

  /**
   * Label d'une métrique de carte. En IBM Plex et non en mono : c'est ce que
   * fixe Composants detail 04, contre la règle générale du §03.
   */
  metricLabel: {
    ...text[10],
    fontFamily: fontFamily.sansRegular,
    letterSpacing: tracking(10, 0.1),
    color: colors.workoutCard.metricLabel,
  },
  /** Bandeau d'une modale. En IBM Plex également — même arbitrage, même source. */
  banner: {
    ...text[10],
    fontFamily: fontFamily.sansRegular,
    letterSpacing: tracking(10, 0.26),
  },
} as const;

/** JetBrains Mono. §03 : capitales uniquement, jamais une phrase. */
const mono = {
  /** Label de section : « ACTIVITÉ RÉCENTE ». */
  label: {
    ...text[12],
    fontFamily: fontFamily.monoMedium,
    letterSpacing: tracking(12, 0.16),
    color: colors.text.label,
  },
  /** Surtitre d'un moment cérémoniel : « NOUVEAU TITRE ». */
  eyebrow: {
    ...text[10],
    fontFamily: fontFamily.monoMedium,
    letterSpacing: tracking(10, 0.2),
    color: colors.text.progress,
  },
  /** Marqueur d'état discret, en bas d'échelle. */
  meta: {
    ...text[10],
    fontFamily: fontFamily.monoMedium,
    letterSpacing: tracking(10, 0.16),
    color: colors.text.label,
  },
} as const;

/**
 * Gravure d'un médaillon — Composants detail 03. Le chiffre change d'échelle
 * avec le médaillon, et la mention « NIV » disparaît quand la place manque.
 * La couleur est posée par le composant, qui seul sait si le fond est un cadre
 * ou un aplat d'or.
 */
const medallion = {
  s: { caption: null, numeral: medallionNumeral(14) },
  m: { caption: medallionCaption(), numeral: medallionNumeral(28) },
  l: { caption: medallionCaption(), numeral: medallionNumeral(36) },
  ceremony: { caption: null, numeral: medallionNumeral(36) },
} as const;

function medallionCaption() {
  return {
    ...text[10],
    fontFamily: fontFamily.sansRegular,
    letterSpacing: tracking(10, 0.16),
    color: colors.medallion.caption,
  } as const;
}

function medallionNumeral(size: 14 | 28 | 36) {
  return { ...text[size], fontFamily: fontFamily.sansBold, ...tabular } as const;
}

export const typography = { display, sans, mono, medallion } as const;

export type Typography = typeof typography;
