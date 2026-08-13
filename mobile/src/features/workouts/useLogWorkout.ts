import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiRequest, ApiError } from '../../lib/api';
import type { Database } from '../../lib/database.types';
import { useUserStore, type Profile, type Progress } from '../../store/userStore';
import type { NarrativeBeat } from '../narrative/narrativeState';
import { useOnboardingStore } from '../onboarding/onboardingStore';
import { useSports } from '../sports/useSports';
import {
  metricFieldsFor,
  missingRequiredFields,
  parseMetrics,
} from './sportMetrics';

export type WorkoutLog = Database['public']['Tables']['workout_logs']['Row'];

/** Ce que `POST /workouts` renvoie — la forme de `GET /users/me`, plus le gain. */
type WorkoutCreated = {
  profile: Profile;
  progress: Progress;
  award: {
    workout: WorkoutLog;
    xpAwarded: number;
    breakdown: { attendance: number; effort: number; streak: number };
    levelBefore: number;
    levelAfter: number;
    leveledUp: boolean;
    cappedReason: 'daily_limit' | 'too_close' | null;
  };
  /**
   * Fragments que la séance vient d'ouvrir. Vide si rien n'a été franchi — mais
   * aussi si la synchronisation a échoué côté serveur, où elle est best-effort.
   * L'absence n'est donc pas une preuve, seulement une occasion manquée.
   */
  narrative: { unlocked: NarrativeBeat[] };
};

/**
 * Ce que l'écran affiche après une séance enregistrée.
 *
 * Les beats sont gardés entiers et non comptés : la modale les annonce par leur
 * titre. Leur texte, en revanche, n'est pas montré ici — sa lecture appartient
 * au codex, seul endroit qui la date (`read_at`). Un fragment lu hors de lui se
 * représenterait à la prochaine ouverture.
 */
export type WorkoutResult = WorkoutCreated['award'] & {
  unlocked: NarrativeBeat[];
};

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
      setResult({ ...created.award, unlocked: created.narrative.unlocked });
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
