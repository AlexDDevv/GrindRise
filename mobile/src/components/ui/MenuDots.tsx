import { Pressable, StyleSheet, View } from 'react-native';

import { colors, programCard } from '../../theme';

/**
 * Les trois points qui ouvrent un `MenuSheet` — maquette 10, écrans ⑥′ et ⑦′.
 *
 * Dessinés et non tirés d'une police d'icônes : trois carrés de trois points
 * sont exactement ce que la maquette montre, et `@expo/vector-icons` n'a pas de
 * glyphe à angle vif — le §04 n'accorde aucun arrondi.
 *
 * La cible tactile vient de `hitSlop` et non de la taille de la vue : les trois
 * points font neuf points de haut, et les grossir les rendrait lourds à côté du
 * texte qu'ils accompagnent.
 */

type Props = {
  onPress: () => void;
  /** Ce sur quoi le menu porte : « Actions sur Push Pull Legs ». */
  accessibilityLabel: string;
  /** Horizontaux plutôt que verticaux, quand ils bordent une ligne de titre. */
  horizontal?: boolean;
};

export function MenuDots({ onPress, accessibilityLabel, horizontal = false }: Props) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={programCard.menuHitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.dots, horizontal && styles.horizontal]}
    >
      <View style={styles.dot} />
      <View style={styles.dot} />
      <View style={styles.dot} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dots: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: programCard.menuDotGap,
  },
  horizontal: {
    flexDirection: 'row',
  },
  dot: {
    width: programCard.menuDot,
    height: programCard.menuDot,
    backgroundColor: colors.text.secondary,
  },
});
