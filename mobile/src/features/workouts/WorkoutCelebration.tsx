import { useMemo, useState } from 'react';

import { LevelUpModal } from '../../components/ui';
import type { NarrativeBeat } from '../narrative/narrativeState';
import type { LevelProgress } from '../progression/levels';
import type { WorkoutResult } from './useLogWorkout';

/**
 * Ce qu'une séance a déclenché, présenté un moment à la fois.
 *
 * Une même séance peut faire monter d'un palier *et* ouvrir des fragments : le
 * niveau global est l'un des deux déclencheurs narratifs. Les empiler dans une
 * seule modale mélangerait deux registres que le DA sépare — l'or de la
 * progression, le rouge du récit — et le §02 interdit précisément de les poser
 * ensemble en aplat. Ils défilent donc, dans l'ordre où ils comptent : le palier
 * d'abord, c'est la cérémonie ; les fragments ensuite, en version rentrée.
 *
 * Les fragments sont annoncés, pas racontés. Leur texte se lit dans le codex,
 * seul endroit qui date la première consultation (`read_at`) — l'afficher ici
 * ferait deux chemins de lecture pour un fragment, dont un qui ne le marquerait
 * jamais comme lu, et il se représenterait indéfiniment.
 */

/** Un moment à annoncer, dans l'ordre de présentation. */
type Moment =
  | { kind: 'levelUp'; level: number; title: string; lore: string; progress: LevelProgress }
  | { kind: 'fragment'; beat: NarrativeBeat };

type Props = {
  result: WorkoutResult;
  /**
   * Position du joueur après la séance, pour la jauge de la cérémonie. Nulle si
   * la courbe de niveaux n'a pas pu être lue : le palier s'annonce alors sans
   * elle plutôt que pas du tout.
   */
  progress: LevelProgress | null;
  /** Titre du palier atteint, tiré de `level_thresholds`. */
  levelTitle: string | null;
  /** Phrase du palier (`level_thresholds.unlock_description`), souvent absente. */
  levelLore: string | null;
};

export function WorkoutCelebration({ result, progress, levelTitle, levelLore }: Props) {
  const moments = useMemo((): Moment[] => {
    const queue: Moment[] = [];

    if (result.leveledUp && progress) {
      queue.push({
        kind: 'levelUp',
        level: result.levelAfter,
        // Un palier sans titre en base garde quand même sa cérémonie : le
        // niveau atteint est l'information, le titre l'habille.
        title: levelTitle || `Niveau ${result.levelAfter}`,
        // `unlock_description` n'est pas rempli par le seed. La phrase de repli
        // dit ce qui s'est passé sans prétendre au lore qui reste à écrire.
        lore:
          levelLore ??
          'Le palier est franchi. Ce que tu as gagné ne se reperd pas.',
        progress,
      });
    }

    for (const beat of result.unlocked) {
      queue.push({ kind: 'fragment', beat });
    }

    return queue;
  }, [levelLore, levelTitle, progress, result]);

  const [index, setIndex] = useState(0);

  const moment = moments[index];
  if (!moment) return null;

  const remaining = moments.length - index - 1;
  const advance = () => setIndex(index + 1);
  // Fermer saute la file entière : quelqu'un qui écarte la première annonce ne
  // veut pas en voir trois autres.
  const dismissAll = () => setIndex(moments.length);

  if (moment.kind === 'levelUp') {
    return (
      <LevelUpModal
        visible
        variant="levelUp"
        level={moment.level}
        title={moment.title}
        lore={moment.lore}
        xp={{
          value: moment.progress.gauge.value,
          max: moment.progress.gauge.max,
          nextLevel: moment.progress.nextLevel ?? moment.progress.level,
        }}
        action={{
          label: remaining > 0 ? 'Et ensuite…' : 'Continuer',
          onPress: advance,
        }}
        dismissLabel="Fermer"
        onClose={dismissAll}
      />
    );
  }

  return (
    <LevelUpModal
      visible
      variant="fragment"
      title={moment.beat.title}
      lore="Il t’attend dans ton codex, avec le reste de ton histoire."
      action={{
        label: remaining > 0 ? `Fragment suivant (${remaining})` : 'Continuer',
        onPress: remaining > 0 ? advance : dismissAll,
      }}
      dismissLabel="Fermer"
      onClose={dismissAll}
    />
  );
}
