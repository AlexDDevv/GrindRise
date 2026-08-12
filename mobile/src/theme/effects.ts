import type { BoxShadowValue } from 'react-native';

import { colors } from './colors';

/**
 * Ombres, lueurs et voiles — `Composants detail.dc.html`.
 *
 * Le DA n'utilise l'ombre qu'à deux fins : décoller une modale du fond, et
 * faire rougeoyer l'or d'une jauge. Aucune carte ne porte d'ombre — c'est le
 * filet à 10 % qui la détache.
 */

/** Lueur de la barre d'XP — Composants detail 02. */
export const glow = {
  /** Jauge en cours de remplissage. */
  xp: {
    offsetX: 0,
    offsetY: 0,
    blurRadius: 10,
    spreadDistance: 0,
    color: 'rgba(232, 189, 108, 0.45)',
  } satisfies BoxShadowValue,
  /** Palier complet : la braise monte. */
  xpComplete: {
    offsetX: 0,
    offsetY: 0,
    blurRadius: 14,
    spreadDistance: 0,
    color: 'rgba(232, 189, 108, 0.6)',
  } satisfies BoxShadowValue,
} as const;

/** Ombre portée d'une modale — Composants detail 05. */
export const shadow = {
  modal: {
    offsetX: 0,
    offsetY: 20,
    blurRadius: 50,
    spreadDistance: 0,
    color: 'rgba(0, 0, 0, 0.65)',
  } satisfies BoxShadowValue,
} as const;

/**
 * Voile posé derrière une modale cérémonielle. Le DA l'écrit
 * `radial-gradient(90% 50% at 50% 42%, …)` ; React Native n'a pas de dégradé
 * radial en style, les composants le tracent en SVG à partir de ces valeurs.
 */
export const scrim = {
  ceremony: {
    centerX: 0.5,
    centerY: 0.42,
    radiusX: 0.9,
    radiusY: 0.5,
    from: colors.surface.scrimCenter,
    to: colors.surface.scrimEdge,
  },
  /** Voile plat, quand le moment ne mérite pas de mise en scène. */
  plain: colors.surface.scrimEdge,
} as const;

/**
 * Dégradés linéaires, exprimés comme `expo-linear-gradient` les attend.
 * `start`/`end` traduisent l'angle CSS du DA.
 */
export const gradient = {
  /** Remplissage de la jauge d'XP : `linear-gradient(90deg, …)`. */
  xpFill: {
    colors: [colors.xp.fillFrom, colors.xp.fillTo] as const,
    start: { x: 0, y: 0.5 },
    end: { x: 1, y: 0.5 },
  },
  /** Fond d'une modale cérémonielle : `linear-gradient(180deg, …)`. */
  modalCeremony: {
    colors: [colors.modal.ceremonyFrom, colors.modal.to] as const,
    start: { x: 0.5, y: 0 },
    end: { x: 0.5, y: 1 },
  },
  /** Fond d'une modale sobre. */
  modalQuiet: {
    colors: [colors.modal.quietFrom, colors.modal.to] as const,
    start: { x: 0.5, y: 0 },
    end: { x: 0.5, y: 1 },
  },
  /**
   * Cadre d'un médaillon : `linear-gradient(160deg, …)`. 160° depuis la
   * verticale place l'attaque en haut à gauche et la fuite en bas à droite.
   */
  medallionFrame: {
    colors: [colors.medallion.frameFrom, colors.medallion.frameTo] as const,
    start: { x: 0.17, y: 0 },
    end: { x: 0.83, y: 1 },
  },
  /** Médaillon plein du level-up : le même angle, l'or à l'envers. */
  medallionSolid: {
    colors: [colors.medallion.solidFrom, colors.medallion.solidTo] as const,
    start: { x: 0.17, y: 0 },
    end: { x: 0.83, y: 1 },
  },
} as const;
