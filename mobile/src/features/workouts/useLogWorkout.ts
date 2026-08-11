import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiRequest, ApiError } from '../../lib/api';
import type { Database } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import { useUserStore, type Profile, type Progress } from '../../store/userStore';
import {
  metricFieldsFor,
  missingRequiredFields,
  parseMetrics,
} from './sportMetrics';

export type Sport = Database['public']['Tables']['sports']['Row'];
export type WorkoutLog = Database['public']['Tables']['workout_logs']['Row'];

/** Ce que `POST /workouts` renvoie — même forme que `GET /users/me`, plus le gain. */
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
  /** Fragments que la séance vient d'ouvrir. Vide si rien n'a été franchi. */
  narrative: {
    unlocked: Database['public']['Tables']['narrative_beats']['Row'][];
  };
};

/**
 * Ce que l'écran de confirmation a besoin de savoir.
 *
 * Le compte de fragments plutôt que les fragments : l'écran annonce, il ne
 * raconte pas. La présentation du texte appartient au codex, qui sait la dater
 * (`read_at`) — la dupliquer ici ferait deux chemins de lecture pour un seul
 * fragment, dont un qui ne le marquerait pas comme lu.
 */
export type WorkoutResult = WorkoutCreated['award'] & {
  unlockedBeats: number;
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

  const [sports, setSports] = useState<Sport[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sportId, setSportId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<WorkoutResult | null>(null);

  const fields = useMemo(() => metricFieldsFor(sportId), [sportId]);

  const loadSports = useCallback(async () => {
    setLoadError(null);

    // Lecture publique (`sports_select_public`) : pas besoin de l'API pour ça.
    const { data, error } = await supabase.from('sports').select('*').order('name');

    if (error) {
      console.warn('[workouts] lecture des sports impossible :', error.message);
      setLoadError('Impossible de charger les sports. Vérifie ta connexion.');
      return;
    }

    setSports(data);
    setSportId((current) => current ?? data[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void loadSports();
  }, [loadSports]);

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
        unlockedBeats: created.narrative.unlocked.length,
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
    reloadSports: loadSports,
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
