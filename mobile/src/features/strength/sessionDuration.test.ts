import { createSession } from './sessionState';
import {
  DURATION_MAX_MIN,
  IMPLAUSIBLE_DURATION_MIN,
  clampDurationMin,
  elapsedMinutes,
  formatDurationLabel,
  formatStopwatch,
  isImplausible,
  sessionDurationMin,
} from './sessionDuration';
import type { SessionState } from './types';

const MINUTE = 60_000;

const seance = (over: Partial<SessionState> = {}): SessionState => ({
  ...createSession(0),
  ...over,
});

describe('elapsedMinutes', () => {
  it('arrondit à la minute supérieure : une séance commencée compte pour une', () => {
    expect(elapsedMinutes(0, 30_000)).toBe(1);
    expect(elapsedMinutes(0, 52 * MINUTE)).toBe(52);
    expect(elapsedMinutes(0, 52 * MINUTE + 14_000)).toBe(53);
  });

  it('ne descend jamais sous 1, ce que le DTO exige', () => {
    // `@Min(1)` sur durationMin : envoyer 0 serait un 400.
    expect(elapsedMinutes(0, 0)).toBe(1);
    expect(elapsedMinutes(1_000, 0)).toBe(1);
  });
});

describe('sessionDurationMin', () => {
  it('suit le chrono tant qu\'aucune correction n\'a été faite', () => {
    expect(sessionDurationMin(seance(), 52 * MINUTE)).toBe(52);
  });

  it('la correction l\'emporte, et n\'est pas écrasée au tic suivant', () => {
    // Le point de `durationOverrideMin` : un seul champ remis à jour chaque
    // seconde perdrait la correction à la seconde d\'après.
    const corrigee = seance({ durationOverrideMin: 52 });

    expect(sessionDurationMin(corrigee, 3 * 60 * MINUTE)).toBe(52);
    expect(sessionDurationMin(corrigee, 4 * 60 * MINUTE)).toBe(52);
  });

  it('borne à 1 440 minutes, ce que le DTO accepte au plus', () => {
    expect(sessionDurationMin(seance(), 40 * 60 * MINUTE)).toBe(DURATION_MAX_MIN);
    expect(sessionDurationMin(seance({ durationOverrideMin: 9_999 }), 0)).toBe(
      DURATION_MAX_MIN,
    );
  });
});

describe('clampDurationMin', () => {
  it('tient les deux bornes du DTO, `@Min(1)` et `@Max(1_440)`', () => {
    expect(clampDurationMin(0)).toBe(1);
    expect(clampDurationMin(-30)).toBe(1);
    expect(clampDurationMin(52)).toBe(52);
    expect(clampDurationMin(9_999)).toBe(DURATION_MAX_MIN);
  });

  it('rend une minute entière : le DTO n’accepte pas de décimale', () => {
    expect(clampDurationMin(51.4)).toBe(51);
    expect(clampDurationMin(51.6)).toBe(52);
  });
});

describe('isImplausible', () => {
  it('se déclenche au-delà de trois heures', () => {
    expect(IMPLAUSIBLE_DURATION_MIN).toBe(180);
    expect(isImplausible(179)).toBe(false);
    expect(isImplausible(180)).toBe(false);
    expect(isImplausible(181)).toBe(true);
  });
});

describe('formatStopwatch', () => {
  it('affiche mm:ss sous l\'heure', () => {
    expect(formatStopwatch(0, 32 * MINUTE + 14_000)).toBe('32:14');
    expect(formatStopwatch(0, 5_000)).toBe('00:05');
  });

  it('ajoute les heures au-delà, plutôt que d\'afficher 187:03', () => {
    expect(formatStopwatch(0, 3 * 60 * MINUTE + 7 * MINUTE + 3_000)).toBe('3:07:03');
  });
});

describe('formatDurationLabel', () => {
  it('écrit une durée en toutes lettres, comme le titre de l\'écran de fin', () => {
    expect(formatDurationLabel(52)).toBe('52 min');
    expect(formatDurationLabel(60)).toBe('1 h');
    expect(formatDurationLabel(95)).toBe('1 h 35');
  });
});
