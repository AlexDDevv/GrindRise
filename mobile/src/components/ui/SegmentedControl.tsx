import { Pressable, StyleSheet, Text, View } from 'react-native';

import { border, colors, radius, touchTarget, typography } from '../../theme';

/**
 * Choix exclusif entre deux ou trois segments — maquette 09, composant 07.
 *
 * L'état actif est un voile d'or plus un liseré, jamais un aplat : le §02
 * réserve l'aplat d'or aux actions, et un segment n'en est pas une. Les
 * libellés sont en mono capitales, ce que le §03 réserve aux labels — deux
 * mots, jamais une phrase.
 *
 * Le rôle d'accessibilité est `radio` et non `button` : c'est un choix
 * exclusif, et un lecteur d'écran doit annoncer lequel est retenu. Même
 * raisonnement que `SportPicker`.
 *
 * Générique sur la valeur pour que l'appelant garde son union de chaînes plutôt
 * que de repasser par `string` et de recaster derrière.
 */

type Option<T extends string> = {
  value: T;
  /** Deux mots au plus : le segment ne s'élargit pas. */
  label: string;
};

type Props<T extends string> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: Props<T>) {
  return (
    <View
      style={styles.track}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
              {option.label.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    height: touchTarget.minimum,
    backgroundColor: colors.control.track,
    borderWidth: border.hairline,
    borderColor: colors.control.trackBorder,
    borderRadius: radius.none,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {
    backgroundColor: colors.control.activeBackground,
    borderWidth: border.hairline,
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
