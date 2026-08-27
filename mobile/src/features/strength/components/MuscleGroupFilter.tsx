import { ChipFilter } from '../../../components/ui';
import { MUSCLE_GROUPS, muscleGroupLabel } from '../muscleGroups';
import type { MuscleGroup } from '../types';

/**
 * Filtre par groupe musculaire — maquette 09, écran ④.
 *
 * La rangée de puces elle-même vit dans `ChipFilter` : l'historique en emploie
 * une identique pour filtrer par sport, et la dupliquer aurait fait diverger le
 * geste de désélection et l'alignement de la première puce. Il ne reste ici que
 * ce qui est propre aux groupes musculaires — leur liste et leurs libellés.
 */

type Props = {
  value: MuscleGroup | null;
  onChange: (value: MuscleGroup | null) => void;
};

const OPTIONS = MUSCLE_GROUPS.map((group) => ({
  value: group,
  label: muscleGroupLabel(group),
}));

export function MuscleGroupFilter({ value, onChange }: Props) {
  return <ChipFilter options={OPTIONS} value={value} onChange={onChange} />;
}
