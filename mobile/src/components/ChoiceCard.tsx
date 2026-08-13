import { Pressable, StyleSheet, Text, View } from 'react-native';

import { border, colors, gap, padding, typography } from '../theme';

/**
 * Carte d'un choix unique dans une liste : un sport, une classe.
 *
 * Elle n'est pas un des cinq composants du DA — c'est une carte au sens du §04,
 * habillée comme `WorkoutCard` (fond surélevé, filet à 10 %, aucun rayon) et
 * dont seul l'état sélectionné ajoute quelque chose : le filet passe à l'or,
 * jamais un aplat. Le DA réserve l'aplat d'or aux actions, et une liste de
 * quatre cartes toutes dorées ne dirait plus laquelle est choisie.
 *
 * `detail` ne s'affiche qu'une fois la carte choisie. C'est ce qui permet au
 * `lore_intro` d'une classe d'être long : quatre lores dépliés à la fois font
 * un mur de texte que personne ne lit, alors qu'un seul, ouvert au moment du
 * choix, est exactement ce qu'on vient chercher.
 */

type Props = {
  title: string;
  /** Une ligne de contexte, toujours visible. */
  subtitle?: string;
  /** Texte long, révélé à la sélection. */
  detail?: string;
  /** Emblème à gauche du titre : hexagone de sport, médaillon. */
  emblem?: React.ReactNode;
  selected: boolean;
  onPress: () => void;
};

export function ChoiceCard({ title, subtitle, detail, emblem, selected, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && !selected && styles.cardPressed,
      ]}
    >
      <View style={styles.header}>
        {emblem}

        <View style={styles.titleBlock}>
          <Text style={typography.display.cardTitle}>{title}</Text>
          {subtitle ? <Text style={typography.sans.caption}>{subtitle}</Text> : null}
        </View>
      </View>

      {selected && detail ? (
        <Text style={[typography.display.lore, styles.detail]}>{detail}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: gap.row,
    paddingVertical: padding.card.y,
    paddingHorizontal: padding.card.x,
    backgroundColor: colors.surface.raised,
    borderWidth: border.hairline,
    borderColor: colors.line.default,
  },
  cardPressed: {
    borderColor: colors.line.control,
  },
  cardSelected: {
    borderColor: colors.accent.gold,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: gap.row,
  },
  titleBlock: {
    flex: 1,
    gap: gap.line,
  },
  detail: {
    // Le lore se lit à gauche dans une carte, et non centré comme dans une
    // modale : c'est un paragraphe, pas une citation mise en scène.
    textAlign: 'left',
  },
});
