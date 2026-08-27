import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { border, colors, gap, padding, spacing, touchTarget, typography } from '../../theme';

/**
 * Rangée défilante de puces à choix unique — maquette 09, écran ④.
 *
 * Une rangée et non une grille : une douzaine de puces en grille pousseraient la
 * liste qu'elles filtrent hors de l'écran, alors qu'on vient chercher ce qu'il y
 * a dans la liste, pas une puce. La puce active reprend le traitement du segment
 * actif — voile d'or et liseré, jamais un aplat.
 *
 * **Un second appui sur la puce active la désélectionne.** C'est le geste qu'on
 * cherche instinctivement, et une puce « tous » de plus encombrerait la rangée
 * pour dire ce que l'absence de sélection dit déjà.
 *
 * La marge latérale reprend celle de l'écran (`spacing.screen`) et non le
 * rembourrage d'une carte : cette rangée défile bord à bord derrière l'ossature
 * `Screen`, qui neutralise sa propre marge pour elle — voir
 * `ExerciseCatalogScreen`. Sans cet alignement, la première puce ne tomberait
 * pas sous le texte qui la précède.
 */

export type ChipOption<T> = {
  value: T;
  /** Affiché en capitales : la rangée est une suite de labels, pas de phrases. */
  label: string;
};

type Props<T> = {
  options: readonly ChipOption<T>[];
  /** Nul quand rien n'est filtré. */
  value: T | null;
  onChange: (value: T | null) => void;
};

export function ChipFilter<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="radiogroup"
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(selected ? null : option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {option.label.toUpperCase()}
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
