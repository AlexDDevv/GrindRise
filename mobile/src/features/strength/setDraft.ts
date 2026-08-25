import type { SetDraft } from './types';

/**
 * Brouillon d'une série, tel que la feuille de saisie le manipule.
 *
 * Les champs sont des chaînes et non des nombres : c'est ce qu'un `TextInput`
 * porte, et convertir à chaque frappe empêcherait de saisir « 8, » ou d'effacer
 * un champ. La conversion a lieu une fois, à la validation.
 *
 * Toute la logique de la feuille est ici, y compris ce qui survit à une bascule
 * de type et ce que valent les raccourcis : la feuille n'en est que le rendu, et
 * ces règles se testent sans monter un composant.
 *
 * Les bornes reprennent celles de `LoggedSetDto` et du schéma. Les faire
 * respecter ici n'est pas une duplication de sécurité — le serveur reste
 * l'autorité — mais l'économie d'un aller-retour réseau pour une faute que le
 * champ pouvait signaler tout de suite.
 */

type SetType = 'reps' | 'time';

export type SetDraftInput = {
  type: SetType;
  /** Saisie brute du comptage : répétitions, ou durée **en secondes**. */
  count: string;
  /** Saisie brute de la charge, ou du lest quand `isBodyweight`. */
  weight: string;
  isBodyweight: boolean;
};

export type ParseResult =
  | { ok: true; set: SetDraft }
  | { ok: false; message: string };

/** `check (reps > 0)` et `@Max(1_000)`. */
const REPS_MIN = 1;
const REPS_MAX = 1_000;

/** `check (duration_seconds > 0)` et `@Max(36_000)` — dix heures. */
const SECONDS_MIN = 1;
const SECONDS_MAX = 36_000;

/** `check (weight_kg >= 0)` et `@Max(1_000)`. */
const WEIGHT_MIN = 0;
const WEIGHT_MAX = 1_000;

/** Raccourcis de durée de la maquette ③b, en secondes. */
export const TIME_SHORTCUTS_SECONDS = [30, 45, 60] as const;

export function emptyDraft(type: SetType = 'reps'): SetDraftInput {
  return { type, count: '', weight: '', isBodyweight: false };
}

/** Rouvre une série déjà saisie, pour l'éditer. */
export function draftFrom(set: SetDraft): SetDraftInput {
  return {
    type: set.type,
    count: String(set.type === 'reps' ? set.reps : set.durationSeconds),
    // Une charge nulle est un champ vide : `String(null)` afficherait « null ».
    weight: set.weightKg === null ? '' : String(set.weightKg),
    isBodyweight: set.isBodyweight,
  };
}

/**
 * « Reprendre la série précédente ».
 *
 * Identique à `draftFrom` aujourd'hui, et nommée à part quand même : les deux
 * gestes n'ont pas la même raison d'être, et le jour où la reprise incrémente
 * la charge, c'est ici que ça se décidera.
 */
export function repeatOf(set: SetDraft): SetDraftInput {
  return draftFrom(set);
}

/**
 * Bascule répétitions ↔ temps.
 *
 * Le comptage est vidé : 10 répétitions ne font pas 10 secondes, et garder le
 * nombre proposerait une valeur fausse avec l'air d'être juste. La charge et le
 * poids du corps survivent — ils gardent le même sens dans les deux modes.
 */
export function switchType(input: SetDraftInput, type: SetType): SetDraftInput {
  if (input.type === type) return input;

  return { ...input, type, count: '' };
}

/**
 * Raccourcis −1 / +1 de la maquette ③.
 *
 * En mode temps, l'entrée est rendue telle quelle : les raccourcis d'une série
 * au temps sont des durées entières (`TIME_SHORTCUTS_SECONDS`), pas des pas
 * d'une seconde.
 */
export function step(input: SetDraftInput, delta: number): SetDraftInput {
  if (input.type === 'time') return input;

  const courant = Number.parseInt(input.count, 10);
  const base = Number.isFinite(courant) ? courant : 0;
  const suivant = Math.min(REPS_MAX, Math.max(REPS_MIN, base + delta));

  return { ...input, count: String(suivant) };
}

export function parseDraft(input: SetDraftInput): ParseResult {
  const weight = readWeight(input.weight);
  if (weight === 'invalide') {
    return {
      ok: false,
      message: `La charge doit être un nombre entre ${WEIGHT_MIN} et ${WEIGHT_MAX} kg.`,
    };
  }

  if (input.type === 'reps') {
    const reps = readInteger(input.count, REPS_MIN, REPS_MAX);
    if (reps === null) {
      return {
        ok: false,
        message:
          input.count.trim() === ''
            ? 'Indique le nombre de répétitions.'
            : `Le nombre de répétitions doit être entier, entre ${REPS_MIN} et ${REPS_MAX}.`,
      };
    }

    return { ok: true, set: { type: 'reps', reps, weightKg: weight, isBodyweight: input.isBodyweight } };
  }

  const durationSeconds = readInteger(input.count, SECONDS_MIN, SECONDS_MAX);
  if (durationSeconds === null) {
    return {
      ok: false,
      message:
        input.count.trim() === ''
          ? 'Indique la durée en secondes.'
          : `La durée doit être entière, entre ${SECONDS_MIN} et ${SECONDS_MAX} secondes.`,
    };
  }

  return {
    ok: true,
    set: {
      type: 'time',
      durationSeconds,
      weightKg: weight,
      isBodyweight: input.isBodyweight,
    },
  };
}

/** @returns l'entier, ou `null` si la saisie n'en est pas un dans les bornes. */
function readInteger(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const value = Number(decimalise(trimmed));
  if (!Number.isInteger(value) || value < min || value > max) return null;

  return value;
}

/**
 * La virgule du clavier français, **toutes** les virgules.
 *
 * `replace` n'en remplacerait que la première : « 1,2,5 » deviendrait « 1.2,5 »,
 * que `Number` lit `NaN` — mais par accident, et « 1,2,5,3 » aurait pu passer
 * pour 1,2. Les remplacer toutes fait rejeter la saisie pour ce qu'elle est.
 */
const decimalise = (raw: string): string => raw.replaceAll(',', '.');

/** @returns la charge, `null` si le champ est vide ou nul, `'invalide'` sinon. */
function readWeight(raw: string): number | null | 'invalide' {
  const trimmed = raw.trim();
  // Vide n'est pas zéro : ce sera un champ omis, pas une charge déclarée.
  if (trimmed === '') return null;

  const value = Number(decimalise(trimmed));
  if (!Number.isFinite(value) || value < WEIGHT_MIN || value > WEIGHT_MAX) {
    return 'invalide';
  }

  // `numeric(6, 2)` : le centième est tout ce que la base retiendra.
  const arrondie = Math.round(value * 100) / 100;

  // Zéro rejoint le champ vide plutôt que de partir tel quel. `toWorkoutPayload`
  // n'omet que le nul, et l'en-tête de ce fichier-là est formel : envoyer `0`
  // déclarerait une charge de zéro kilo là où `weight_kg` nul décrit une série
  // sans lest. Une traction saisie « 0 » est une traction sans lest.
  return arrondie === 0 ? null : arrondie;
}
