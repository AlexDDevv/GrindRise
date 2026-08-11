/**
 * Découpage du temps en jours locaux.
 *
 * Séparé des règles d'XP parce que c'est une brique de calendrier, pas de game
 * design : elle n'a aucune notion de séance ni de barème.
 *
 * Pourquoi ici et pas en SQL : le streak et les plafonds journaliers sont la
 * logique la plus exposée à l'exploitation, donc celle qui doit être testable
 * sans base. `performed_at` est un `timestamptz`, donc un instant absolu sans
 * ambiguïté ; tout ce dont on a besoin, c'est de le projeter dans le fuseau du
 * joueur.
 */

/** Jour local au format `YYYY-MM-DD`, tel que stocké dans `last_workout_on`. */
export type LocalDay = string;

export const DEFAULT_TIME_ZONE = 'Europe/Paris';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  formatters.set(timeZone, formatter);
  return formatter;
}

/**
 * Un fuseau inconnu ferait lever `Intl` au moment du calcul, donc au milieu de
 * l'enregistrement d'une séance. La base le refuse déjà (trigger
 * `profiles_timezone_valid`), ceci n'est qu'un filet : une valeur écrite avant
 * cette migration ne doit pas faire échouer un log.
 */
export function resolveTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_TIME_ZONE;

  try {
    formatterFor(timeZone).format(new Date());
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsIn(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

/** Décalage du fuseau à cet instant précis, en millisecondes. */
function offsetAt(instant: Date, timeZone: string): number {
  const parts = partsIn(instant, timeZone);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  // Les décalages de fuseau sont des multiples de la minute : les
  // millisecondes de l'instant sont écartées pour ne pas polluer la
  // soustraction.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Le jour local dans lequel tombe cet instant. */
export function toLocalDay(instant: Date, timeZone: string): LocalDay {
  const { year, month, day } = partsIn(instant, timeZone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(
    day,
  ).padStart(2, '0')}`;
}

/**
 * Bornes d'un jour local, en instants absolus — c'est sous cette forme que la
 * RPC les reçoit, puisqu'elle compare des `timestamptz`.
 *
 * Le décalage est appliqué deux fois : celui de minuit UTC peut différer de
 * celui de minuit local un jour de changement d'heure, et la seconde passe
 * corrige cet écart.
 */
export function localDayBounds(
  day: LocalDay,
  timeZone: string,
): { start: Date; end: Date } {
  const start = startOfLocalDay(day, timeZone);
  const end = startOfLocalDay(addDays(day, 1), timeZone);
  return { start, end };
}

function startOfLocalDay(day: LocalDay, timeZone: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  const utcMidnight = Date.UTC(year, month - 1, date);

  const approximation = utcMidnight - offsetAt(new Date(utcMidnight), timeZone);
  return new Date(utcMidnight - offsetAt(new Date(approximation), timeZone));
}

/** Arithmétique sur les jours locaux, sans repasser par un instant. */
export function addDays(day: LocalDay, amount: number): LocalDay {
  const [year, month, date] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + amount));

  return `${String(shifted.getUTCFullYear()).padStart(4, '0')}-${String(
    shifted.getUTCMonth() + 1,
  ).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

/** Nombre de jours de `from` à `to`, négatif si `to` précède `from`. */
export function daysBetween(from: LocalDay, to: LocalDay): number {
  const parse = (day: LocalDay): number => {
    const [year, month, date] = day.split('-').map(Number);
    return Date.UTC(year, month - 1, date);
  };

  return Math.round((parse(to) - parse(from)) / 86_400_000);
}
