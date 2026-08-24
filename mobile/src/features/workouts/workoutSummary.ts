import type { WorkoutMetric } from '../../components/ui';
import { formatDayLabel, formatNumber } from '../../lib/format';
import { metricFieldsFor, type MetricField } from './sportMetrics';

/**
 * Lecture d'une séance enregistrée, pour l'afficher.
 *
 * Le pendant du formulaire : `sportMetrics` dit quels champs saisir, ce fichier
 * dit comment les relire. Les deux partent de la même config, ce qui tient
 * l'exigence de départ — ajouter un sport, c'est ajouter une entrée dans
 * `SPORT_METRIC_FIELDS`, et il apparaît alors dans le formulaire *et* dans
 * l'historique, sans qu'une ligne de rendu soit à écrire.
 *
 * `workout_logs.metrics` est un `jsonb` : rien ne garantit que ce qui en sort
 * corresponde à la config d'aujourd'hui. Une séance loggée avant qu'un champ
 * soit renommé porte encore l'ancienne clé, et un champ retiré de la config
 * reste dans les vieilles lignes. Les valeurs non reconnues sont donc ignorées
 * plutôt que devinées : mieux vaut une métrique en moins qu'un libellé faux.
 */

/** Ce que `metrics` contient réellement, une fois relu de la base. */
type RawMetrics = Record<string, unknown>;

/** Mot accolé à la valeur : l'unité de la config, quand elle en a une. */
function suffixOf(field: MetricField): string | undefined {
  return field.unit;
}

/**
 * Les métriques d'une séance, dans l'ordre de la config.
 *
 * @param limit nombre maximum de métriques retournées. Une carte détaillée en
 *   aligne trois au plus avant de déborder.
 */
export function readMetrics(
  sportId: string,
  metrics: unknown,
  limit = 3,
): WorkoutMetric[] {
  return readFields(sportId, metrics)
    .map(({ metric }) => metric)
    .slice(0, limit);
}

/** Les métriques présentes, avec le champ qui les décrit. */
function readFields(
  sportId: string,
  metrics: unknown,
): { field: MetricField; metric: WorkoutMetric }[] {
  const raw = (metrics ?? {}) as RawMetrics;

  return metricFieldsFor(sportId).flatMap((field) => {
    const value = raw[field.key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return [];

    return [
      {
        field,
        metric: {
          label: field.label,
          value: formatNumber(value),
          unit: suffixOf(field),
        },
      },
    ];
  });
}

/** Deux métriques au plus dans un résumé : la carte compacte tient sur une ligne. */
const SUMMARY_METRICS = 2;

/**
 * Résumé d'une ligne : « Hier · 8 km · 45 min ».
 *
 * Deux métriques au plus, comme dans le DA : la carte compacte les pose en
 * légende de 12 points, sur une seule ligne qui doit tenir à côté du gain d'XP.
 * L'ordre de déclaration décide, ce qui suffit aux sports à deux champs — les
 * seuls qui restent depuis que la musculation se logue en exercices. Une séance
 * sans métrique se réduit à son jour, ce qui est exactement ce qu'elle dit — la
 * présence a suffi.
 */
export function summarizeWorkout(
  sportId: string,
  metrics: unknown,
  performedAt: string,
  now?: Date,
): string {
  const parts = readFields(sportId, metrics)
    .slice(0, SUMMARY_METRICS)
    .map(({ metric }) => (metric.unit ? `${metric.value} ${metric.unit}` : metric.value));

  return [formatDayLabel(performedAt, now), ...parts].join(' · ');
}

/** Ce qu'il faut d'une séance structurée pour la résumer en une ligne. */
export type StrengthSummarySource = {
  exerciseCount: number;
  setCount: number;
};

/**
 * Résumé d'une séance de musculation : « Hier · 3 exercices · 12 séries ».
 *
 * Une fonction à part et non une branche de `summarizeWorkout` : celle-ci part
 * de `SPORT_METRIC_FIELDS`, dont la musculation ne fait plus partie. Elle ne
 * passe pas non plus par `sessionStats.ts`, qui opère sur le brouillon local en
 * `camelCase` alors qu'on lit ici des lignes Postgres — et le résumé n'a de
 * toute façon aucun tonnage à calculer.
 *
 * Deux chiffres et pas trois : la carte compacte les pose en légende de 12
 * points sur une seule ligne, qui doit tenir à côté du gain d'XP. La durée se
 * lit sur la carte détaillée.
 *
 * Une séance sans exercice se réduit à son jour. C'est le cas des séances
 * antérieures à la refonte : elles portent l'ancien jsonb et aucune ligne dans
 * `logged_exercises`, et leurs trois nombres ne décrivaient rien qu'on veuille
 * réafficher.
 */
export function summarizeStrengthWorkout(
  source: StrengthSummarySource,
  performedAt: string,
  now?: Date,
): string {
  const jour = formatDayLabel(performedAt, now);
  if (source.exerciseCount === 0) return jour;

  const exercices = `${source.exerciseCount} exercice${source.exerciseCount > 1 ? 's' : ''}`;
  const series = `${source.setCount} série${source.setCount > 1 ? 's' : ''}`;

  return [jour, exercices, series].join(' · ');
}
