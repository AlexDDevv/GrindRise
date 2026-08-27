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
  /**
   * Chiffre mono aligné à droite du titre : « 2 PROGRAMMES ».
   *
   * Un décompte et non une description — il tient sur une ligne et se lit en
   * même temps que le titre. Ce qui demande une phrase va dans `subtitle`.
   */
  meta?: string;
  /**
   * Bande de pied, séparée par un filet : un repère de plus sans alourdir la
   * carte — « DERNIER · Push Pull Legs · Jour Pull ».
   */
  footer?: React.ReactNode;
  selected: boolean;
  onPress: () => void;
};

export function ChoiceCard({
  title,
  subtitle,
  detail,
  emblem,
  meta,
  footer,
  selected,
  onPress,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={meta ? `${title}, ${meta.toLowerCase()}` : title}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && !selected && styles.cardPressed,
        // La carte lâche son rembourrage bas : le pied porte le sien, et
        // l'écart entre les deux est déjà celui de la carte.
        footer ? styles.cardWithFooter : null,
      ]}
    >
      <View style={styles.header}>
        {emblem}

        <View style={styles.titleBlock}>
          <View style={styles.titleLine}>
            <Text style={[typography.display.cardTitle, styles.title]}>{title}</Text>
            {meta ? <Text style={typography.mono.meta}>{meta}</Text> : null}
          </View>
          {subtitle ? <Text style={typography.sans.caption}>{subtitle}</Text> : null}
        </View>
      </View>

      {selected && detail ? (
        <Text style={[typography.display.lore, styles.detail]}>{detail}</Text>
      ) : null}

      {footer ? <View style={styles.footer}>{footer}</View> : null}
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
  cardWithFooter: {
    paddingBottom: padding.none,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: gap.row,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: gap.row,
  },
  title: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: gap.row,
    paddingVertical: padding.dense.y,
    paddingHorizontal: padding.card.x,
    // Le pied déborde la gouttière de la carte : le filet doit aller d'un bord
    // à l'autre, ce qu'un pied rentré ne ferait pas.
    marginHorizontal: -padding.card.x,
    borderTopWidth: border.hairline,
    borderTopColor: colors.line.default,
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
