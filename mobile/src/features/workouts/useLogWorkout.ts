import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiRequest, ApiError } from '../../lib/api';
import { useUserStore } from '../../store/userStore';
import { useOnboardingStore } from '../onboarding/onboardingStore';
import { useSports } from '../sports/useSports';
import {
  metricFieldsFor,
  missingRequiredFields,
  parseMetrics,
} from './sportMetrics';
import type { WorkoutCreated, WorkoutResult } from './workoutApi';

export type { WorkoutLog, WorkoutResult } from './workoutApi';

/**
 * Enregistre une séance via l'API.
 *
 * Pas d'insertion Supabase directe, et ce n'est plus seulement une convention :
 * depuis la migration `workouts_server_only`, la RLS ne l'autorise plus. Une
 * séance écrite hors de l'API n'aurait jamais d'XP.
 */
export function useLogWorkout() {
  const applyProgress = useUserStore((s) => s.setProgress);
  const { sports, error: loadError, reload: reloadSports } = useSports();

  // Le sport choisi à l'onboarding présélectionne le formulaire : c'est celui
  // que le joueur logge le plus souvent, donc l'ouvrir sur un autre lui ferait
  // corriger la sélection à chaque séance.
  const preferredSportId = useOnboardingStore((s) => s.sportId);

  const [sportId, setSportId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<WorkoutResult | null>(null);

  const fields = useMemo(() => metricFieldsFor(sportId), [sportId]);

  // La présélection attend le catalogue : un sport absent de `sports` ferait
  // échouer l'insertion sur la clé étrangère.
  useEffect(() => {
    if (sportId !== null || !sports?.length) return;

    const preferred = sports.find((sport) => sport.id === preferredSportId);
    setSportId(preferred?.id ?? sports[0].id);
  }, [preferredSportId, sportId, sports]);

  const selectSport = useCallback((next: string) => {
    setSportId(next);
    // Les champs changent avec le sport : garder les valeurs enverrait une
    // distance saisie pour la course dans une séance de musculation.
    setValues({});
    setSubmitError(null);
  }, []);

  const setValue = useCallback((key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  }, []);

  const missing = useMemo(
    () => missingRequiredFields(fields, values),
    [fields, values],
  );

  const canSubmit = sportId !== null && missing.length === 0 && !isSubmitting;

  const submit = useCallback(async () => {
    if (!sportId) return;

    const metrics = parseMetrics(fields, values);
    if (metrics === null) {
      setSubmitError('Une valeur saisie n’est pas un nombre valide.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const created = await apiRequest<WorkoutCreated>('/workouts', {
        method: 'POST',
        body: {
          sportId,
          // L'instant est envoyé avec son décalage ; c'est le serveur qui le
          // range dans un jour local, d'après le fuseau du profil.
          performedAt: new Date().toISOString(),
          metrics,
        },
      });

      // La progression renvoyée fait autorité : elle sort de la transaction qui
      // vient d'écrire l'XP, alors que le store porte l'état d'avant.
      applyProgress(created.progress);
      setResult({
        ...created.award,
        unlocked: created.narrative.unlocked,
        strength: created.strength,
      });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : 'Impossible de joindre le serveur. Réessaie.';

      console.warn('[workouts] enregistrement impossible :', message);
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [applyProgress, fields, sportId, values]);

  /** Repart d'un formulaire vierge après une séance enregistrée. */
  const reset = useCallback(() => {
    setResult(null);
    setValues({});
    setSubmitError(null);
  }, []);

  return {
    sports,
    loadError,
    reloadSports,
    sportId,
    selectSport,
    fields,
    values,
    setValue,
    missing,
    canSubmit,
    isSubmitting,
    submitError,
    submit,
    result,
    reset,
  };
}
