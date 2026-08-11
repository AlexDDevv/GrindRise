/**
 * Champs du formulaire selon le sport.
 *
 * `workout_logs.metrics` est un `jsonb` : sa forme dépend du sport, et c'est ce
 * fichier qui décide de ce que l'écran affiche.
 *
 * Jumeau de `SPORT_RULES` côté backend (`backend/src/modules/gamification/
 * xp-rules.ts`), volontairement dupliqué : il n'existe pas de package partagé
 * dans ce monorepo, et en créer un pour six lignes coûterait plus cher qu'il ne
 * rapporte. La duplication est sans danger tant que le serveur reste
 * l'autorité — un champ requis manquant est refusé par l'API, quoi qu'affiche
 * le formulaire. Ce qu'on risque, c'est un écran mal aligné, pas de l'XP mal
 * calculée.
 */

export type MetricField = {
  key: string;
  label: string;
  /** Suffixe affiché dans le champ (kg, km…). */
  unit?: string;
  /** Le serveur refuse la séance si ce champ est vide. */
  required: boolean;
  /** Les entiers n'acceptent pas de décimale (séries, répétitions). */
  integer?: boolean;
  placeholder?: string;
};

/** Sports sans définition : présence seule, aucun champ. */
export const SPORT_METRIC_FIELDS: Record<string, MetricField[]> = {
  musculation: [
    { key: 'sets', label: 'Séries', required: true, integer: true, placeholder: '4' },
    { key: 'reps', label: 'Répétitions', required: true, integer: true, placeholder: '10' },
    { key: 'weightKg', label: 'Charge', unit: 'kg', required: true, placeholder: '80' },
  ],
  course: [
    { key: 'distanceKm', label: 'Distance', unit: 'km', required: true, placeholder: '8' },
    { key: 'durationMin', label: 'Durée', unit: 'min', required: false, integer: true, placeholder: '45' },
  ],
  natation: [
    { key: 'distanceM', label: 'Distance', unit: 'm', required: true, placeholder: '1500' },
    { key: 'durationMin', label: 'Durée', unit: 'min', required: false, integer: true, placeholder: '40' },
  ],
  cyclisme: [
    { key: 'distanceKm', label: 'Distance', unit: 'km', required: true, placeholder: '30' },
    { key: 'durationMin', label: 'Durée', unit: 'min', required: false, integer: true, placeholder: '60' },
  ],
};

export function metricFieldsFor(sportId: string | null): MetricField[] {
  if (!sportId) return [];
  return SPORT_METRIC_FIELDS[sportId] ?? [];
}

/**
 * Convertit la saisie en nombres pour l'API.
 *
 * Les champs vides sont omis plutôt qu'envoyés à zéro : le DTO refuse un
 * `sets` à 0, et une virgule décimale (courante sur un clavier français) doit
 * devenir un point avant `Number`.
 *
 * @returns `null` si une valeur saisie n'est pas un nombre.
 */
export function parseMetrics(
  fields: MetricField[],
  values: Record<string, string>,
): Record<string, number> | null {
  const metrics: Record<string, number> = {};

  for (const field of fields) {
    const raw = values[field.key]?.trim() ?? '';
    if (raw === '') continue;

    const parsed = Number(raw.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) return null;

    metrics[field.key] = field.integer ? Math.round(parsed) : parsed;
  }

  return metrics;
}

/** Champs requis laissés vides. Vide si le formulaire est complet. */
export function missingRequiredFields(
  fields: MetricField[],
  values: Record<string, string>,
): MetricField[] {
  return fields.filter(
    (field) => field.required && (values[field.key]?.trim() ?? '') === '',
  );
}
