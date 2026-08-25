import type { SessionState } from './types';

/**
 * Durée d'une séance : chronométrée, corrigeable, bornée.
 *
 * Le chrono propose, l'utilisateur dispose. Un chrono seul produirait une durée
 * fausse dès qu'on oublie de valider — terminer une séance deux heures après
 * l'avoir finie donnerait « 2 h 47 » sans que rien ne le signale. D'où deux
 * garde-fous : la valeur se corrige à tout moment, et au-delà d'un seuil
 * l'écran demande confirmation avant d'envoyer.
 *
 * La durée est sans effet sur l'XP : `SPORT_RULES` n'a pas d'entrée
 * `musculation` côté serveur, donc `computeEffortXp` retourne 0 avant même de
 * lire les métriques. C'est ce qui permet de la laisser saisir librement.
 */

/**
 * Au-delà de trois heures, on demande confirmation.
 *
 * Une séance de musculation plus longue existe mais est rare ; un oubli de
 * validation, lui, dépasse ce seuil presque à coup sûr. Une constante nommée
 * et non un nombre dans une condition : c'est un arbitrage, il doit se relire.
 */
export const IMPLAUSIBLE_DURATION_MIN = 180;

/** `@Max(1_440)` sur `WorkoutMetricsDto.durationMin` — vingt-quatre heures. */
export const DURATION_MAX_MIN = 1_440;

/** `@Min(1)` : une séance dure au moins une minute, ou le DTO la refuse. */
const DURATION_MIN_MIN = 1;

/** Arrondi à la minute supérieure : une séance commencée compte pour une. */
export function elapsedMinutes(startedAt: number, now: number): number {
  const elapsed = Math.ceil(Math.max(0, now - startedAt) / 60_000);

  return Math.max(DURATION_MIN_MIN, elapsed);
}

/**
 * Ramène une durée aux bornes du DTO, à la minute entière.
 *
 * Exportée pour que la correction manuelle soit écrêtée **à l'écriture** et
 * non plus seulement à l'envoi : sinon l'en-tête annonce la valeur tapée, le corps
 * envoie la valeur écrêtée, et l'écran de fin en affiche une troisième.
 */
export function clampDurationMin(minutes: number): number {
  return Math.min(DURATION_MAX_MIN, Math.max(DURATION_MIN_MIN, Math.round(minutes)));
}

/** La correction si elle existe, le chrono sinon ; toujours dans les bornes. */
export function sessionDurationMin(state: SessionState, now: number): number {
  return clampDurationMin(state.durationOverrideMin ?? elapsedMinutes(state.startedAt, now));
}

export function isImplausible(minutes: number): boolean {
  return minutes > IMPLAUSIBLE_DURATION_MIN;
}

/** Le chrono de l'en-tête : `32:14`, et `3:07:03` au-delà de l'heure. */
export function formatStopwatch(startedAt: number, now: number): string {
  const total = Math.floor(Math.max(0, now - startedAt) / 1_000);
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;

  const pad = (value: number) => String(value).padStart(2, '0');

  // Au-delà de l'heure, `187:03` ne se lit plus comme une durée.
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

/** Durée en toutes lettres : « 52 min », « 1 h 35 ». */
export function formatDurationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}
