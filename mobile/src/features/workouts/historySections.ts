import type { LoggedWorkout } from './workoutFeed';

/**
 * L'historique découpé en mois — « AOÛT 2026 », « JUILLET 2026 ».
 *
 * Une liste de cartes sans repère devient illisible passé une vingtaine de
 * lignes : chaque carte porte bien son jour, mais rien ne dit où l'on en est
 * dans le temps. Le mois est la maille juste — la semaine morcellerait un
 * rythme de trois séances, l'année ne dirait rien avant longtemps.
 *
 * **Le découpage suit le fuseau de l'appareil**, comme tout le reste de
 * l'affichage. Le serveur, lui, range les séances en jours locaux au fuseau du
 * profil pour l'XP et la série ; voyager peut donc faire basculer une séance de
 * fin de mois d'un groupe à l'autre. C'est la contrepartie déjà assumée
 * ailleurs, et elle ne touche ici qu'un intertitre.
 *
 * Aucune supposition d'ordre : la fonction regroupe ce qu'on lui donne dans
 * l'ordre où elle le reçoit. C'est l'appelant qui lit du plus récent au plus
 * ancien, et les sections suivent.
 */

export type HistorySection = {
  /** `2026-08`, stable et triable — clé de liste. */
  key: string;
  /** « AOÛT 2026 », prêt à afficher. */
  label: string;
  /**
   * Les séances du mois.
   *
   * Nommé `data` et non `workouts` : c'est le nom qu'impose `SectionList`, et
   * s'en écarter obligerait à retraduire chaque section à chaque rendu pour ne
   * gagner qu'un mot.
   */
  data: LoggedWorkout[];
};

export function groupByMonth(workouts: readonly LoggedWorkout[]): HistorySection[] {
  const sections: HistorySection[] = [];
  const byKey = new Map<string, HistorySection>();

  for (const workout of workouts) {
    const date = new Date(workout.log.performed_at);

    // Une date invalide vient d'une ligne abîmée : la ranger sous un mois
    // inventé serait pire que de la laisser passer sans section propre.
    if (Number.isNaN(date.getTime())) continue;

    const key = monthKey(date);
    const existing = byKey.get(key);

    if (existing) {
      existing.data.push(workout);
      continue;
    }

    const section: HistorySection = { key, label: monthLabel(date), data: [workout] };
    byKey.set(key, section);
    sections.push(section);
  }

  return sections;
}

/** `2026-08` — l'année d'abord, pour que la clé se trie comme le temps. */
function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * « AOÛT 2026 ».
 *
 * Par `toLocaleDateString` comme le reste de `format.ts`, et non par une table
 * de mois écrite à la main : c'est la même source pour tous les libellés de
 * date de l'app, donc un seul endroit où ils peuvent diverger.
 */
function monthLabel(date: Date): string {
  return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).toUpperCase();
}
