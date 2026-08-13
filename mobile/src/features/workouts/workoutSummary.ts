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

/** Mot accolé à la valeur : l'unité si elle existe, sinon l'abréviation. */
function suffixOf(field: MetricField): string | undefined {
  return field.unit ?? field.short;
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
 * Résumé d'une ligne : « Hier · 4 séries · 80 kg ».
 *
 * Deux métriques au plus, comme dans le DA : la carte compacte les pose en
 * légende de 12 points, sur une seule ligne qui doit tenir à côté du gain d'XP.
 * Les champs marqués `highlight` passent devant, ce qui évite de résumer une
 * séance de musculation par ses séries et ses répétitions en laissant tomber la
 * charge. Une séance sans métrique se réduit à son jour, ce qui est exactement ce
 * qu'elle dit — la présence a suffi.
 */
export function summarizeWorkout(
  sportId: string,
  metrics: unknown,
  performedAt: string,
  now?: Date,
): string {
  const present = readFields(sportId, metrics);

  // L'ordre de la config est conservé à l'intérieur de chaque groupe : le tri ne
  // fait que remonter les champs marqués, il ne réordonne pas le reste.
  const ordered = [
    ...present.filter(({ field }) => field.highlight),
    ...present.filter(({ field }) => !field.highlight),
  ];

  const parts = ordered
    .slice(0, SUMMARY_METRICS)
    .map(({ metric }) => (metric.unit ? `${metric.value} ${metric.unit}` : metric.value));

  return [formatDayLabel(performedAt, now), ...parts].join(' · ');
}
