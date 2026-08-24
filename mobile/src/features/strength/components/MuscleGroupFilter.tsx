import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { border, colors, gap, padding, spacing, touchTarget, typography } from '../../../theme';
import { MUSCLE_GROUPS, muscleGroupLabel } from '../muscleGroups';
import type { MuscleGroup } from '../types';

/**
 * Filtre par groupe musculaire — maquette 09, écran ④.
 *
 * Une rangée défilante et non une grille : douze groupes en grille pousseraient
 * la liste d'exercices hors de l'écran, alors qu'on vient chercher un exercice,
 * pas un groupe. Le groupe actif reprend le traitement du segment actif — voile
 * d'or et liseré, jamais un aplat.
 *
 * Un second appui sur le groupe actif le désélectionne : c'est le geste qu'on
 * cherche instinctivement, et une puce « tous » de plus encombrerait la rangée.
 *
 * La marge latérale ici reprend celle de l'écran (`spacing.screen`) et non le
 * rembourrage de carte : cette rangée défile bord à bord derrière l'ossature
 * `Screen`, qui neutralise sa propre marge pour elle (voir
 * `ExerciseCatalogScreen`). Sans cet alignement, la première puce ne
 * tomberait pas sous le texte qui la précède.
 */

type Props = {
  value: MuscleGroup | null;
  onChange: (value: MuscleGroup | null) => void;
};

export function MuscleGroupFilter({ value, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="radiogroup"
    >
      {MUSCLE_GROUPS.map((group) => {
        const selected = group === value;

        return (
          <Pressable
            key={group}
            onPress={() => onChange(selected ? null : group)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={muscleGroupLabel(group)}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {muscleGroupLabel(group).toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: gap.line,
    paddingHorizontal: spacing.screen,
  },
  chip: {
    justifyContent: 'center',
    minHeight: touchTarget.minimum,
    paddingHorizontal: padding.buttonCompact,
    borderWidth: border.hairline,
    borderColor: colors.line.control,
  },
  chipSelected: {
    backgroundColor: colors.control.activeBackground,
    borderColor: colors.control.activeBorder,
  },
  label: {
    ...typography.mono.meta,
    color: colors.control.label,
  },
  labelSelected: {
    color: colors.control.activeLabel,
  },
});
