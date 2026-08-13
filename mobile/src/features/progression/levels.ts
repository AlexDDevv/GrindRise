import type { Database } from '../../lib/database.types';

export type LevelThreshold = Database['public']['Tables']['level_thresholds']['Row'];

/**
 * Position du joueur dans sa courbe de niveaux.
 *
 * `user_progress.current_xp` est un cumul depuis toujours, pas une jauge qui se
 * vide à chaque palier — c'est ce qui rend la valeur recalculable par un simple
 * `sum(xp_events.amount)`. Une barre de progression, elle, doit montrer le
 * chemin parcouru *dans le palier courant*. La soustraction est faite ici, une
 * fois, plutôt que dans chaque écran qui affiche une jauge.
 */
export type LevelProgress = {
  level: number;
  /** `level_thresholds.title` : « Novice », « Initié »… */
  title: string;
  /** XP acquise à l'intérieur du palier courant. */
  xpInLevel: number;
  /** XP que le palier courant demande en entier. */
  xpForLevel: number;
  /** Nul au dernier palier connu de la courbe. */
  nextLevel: number | null;
  xpToNext: number | null;
  /** Vrai quand la courbe n'a plus de palier au-dessus. */
  atMaximum: boolean;
  /**
   * Ce que `XpBar` doit afficher.
   *
   * Distinct de `xpInLevel` / `xpForLevel` pour un seul cas, celui du dernier
   * palier : il n'y a plus de plafond à viser, et une jauge vide ferait
   * ressembler une progression complète à un échec. Elle s'affiche donc pleine,
   * et le calcul est ici plutôt que recopié dans chaque écran qui dessine une
   * barre.
   */
  gauge: { value: number; max: number };
};

/**
 * Situe un joueur dans la courbe.
 *
 * Le niveau passé en paramètre fait autorité, il n'est pas redéduit de l'XP :
 * c'est le serveur qui le calcule et l'écrit dans `user_progress`, et deux
 * sources de vérité pour le même nombre finiraient par se contredire à l'écran.
 *
 * @param curve tous les paliers, dans n'importe quel ordre.
 * @param level `user_progress.level`.
 * @param currentXp `user_progress.current_xp`, cumul total.
 */
export function levelProgress(
  curve: readonly LevelThreshold[],
  level: number,
  currentXp: number,
): LevelProgress {
  const sorted = [...curve].sort((a, b) => a.level - b.level);

  const current = sorted.find((row) => row.level === level);
  const next = sorted.find((row) => row.level === level + 1);

  // Un niveau absent de la courbe ne devrait pas exister — le serveur le déduit
  // de cette même table. Si ça arrive (courbe rééquilibrée en cours de route),
  // mieux vaut une jauge à zéro qu'un écran vide.
  const floor = current?.xp_required ?? 0;
  const ceiling = next?.xp_required ?? null;

  const xpInLevel = Math.max(0, currentXp - floor);
  const xpForLevel = ceiling === null ? xpInLevel : Math.max(1, ceiling - floor);

  const atMaximum = ceiling === null;

  return {
    level,
    title: current?.title ?? '',
    xpInLevel,
    xpForLevel,
    nextLevel: next?.level ?? null,
    xpToNext: atMaximum ? null : Math.max(0, ceiling - currentXp),
    atMaximum,
    gauge: atMaximum ? { value: 1, max: 1 } : { value: xpInLevel, max: xpForLevel },
  };
}
