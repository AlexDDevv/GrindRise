import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ReorderHandle } from '../../../components/ui';
import {
  border,
  colors,
  exerciseRow,
  gap,
  padding,
  touchTarget,
  typography,
} from '../../../theme';

/**
 * Ligne d'exercice — maquette 09, écrans ④ et ⑦.
 *
 * Deux usages pour une seule ligne : le catalogue, et l'exercice replié pendant
 * un réordonnancement. Les deux affichent la même chose — un nom, un label mono
 * — et la seule différence est la poignée. En faire deux composants les ferait
 * diverger au premier ajustement.
 *
 * L'étiquette « À MOI » marque l'appartenance et non une catégorie inférieure :
 * elle est en or discret, cerclée, jamais en aplat. C'est la seule information
 * qui compte vraiment sur l'origine — un exercice perso s'édite et se supprime,
 * un exercice du catalogue non.
 */

type Props = {
  name: string;
  /** Label mono sous le nom : groupe musculaire, ou rang. */
  subtitle: string;
  /** Exercice créé par l'utilisateur. */
  owned?: boolean;
  onPress?: () => void;
  /** Poignée de réordonnancement, quand la ligne est dans une liste ordonnable. */
  handle?: ReorderHandle;
};

export function ExerciseListItem({ name, subtitle, owned, onPress, handle }: Props) {
  return (
    <Pressable
      onPress={onPress}
      onPressIn={handle?.onPressIn}
      onPressOut={handle?.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={owned ? `${name}, exercice personnel` : name}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {handle ? <Grip /> : null}

      <View style={styles.text}>
        <Text style={typography.sans.body} numberOfLines={1}>
          {name}
        </Text>
        <Text style={typography.mono.meta}>{subtitle.toUpperCase()}</Text>
      </View>

      {owned ? (
        <View style={styles.owned}>
          <Text style={styles.ownedLabel}>À MOI</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Trois filets : le geste de réordonnancement se saisit là et nulle part ailleurs. */
function Grip() {
  return (
    <View style={styles.grip}>
      <View style={styles.gripBar} />
      <View style={styles.gripBar} />
      <View style={styles.gripBar} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: gap.row,
    minHeight: touchTarget.row,
    paddingHorizontal: padding.card.x,
    backgroundColor: colors.surface.raised,
    borderBottomWidth: border.hairline,
    borderBottomColor: colors.line.default,
  },
  rowPressed: {
    backgroundColor: colors.workoutCard.headerBackground,
  },
  text: {
    flex: 1,
    gap: gap.line,
  },
  grip: {
    gap: exerciseRow.gripGap,
  },
  gripBar: {
    width: exerciseRow.gripBar.width,
    height: exerciseRow.gripBar.height,
    backgroundColor: colors.text.label,
  },
  owned: {
    justifyContent: 'center',
    paddingHorizontal: gap.line,
    paddingVertical: exerciseRow.ownedBadgeY,
    borderWidth: border.hairline,
    borderColor: colors.strength.ownedBorder,
  },
  ownedLabel: {
    ...typography.mono.meta,
    color: colors.strength.ownedLabel,
  },
});
