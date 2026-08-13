import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, gap, spacing, typography } from '../../theme';
import { SportEmblem } from './SportEmblem';
import type { Sport } from './useSports';

/**
 * Choix du sport dans le formulaire de séance.
 *
 * Une rangée d'emblèmes et non une liste de cartes, contrairement à
 * l'onboarding : là-bas le sport se choisit une fois et se lit, ici il se
 * confirme d'un regard, séance après séance. Quatre cartes pleine largeur
 * repousseraient les champs de saisie hors de l'écran à chaque ouverture.
 *
 * Le rôle d'accessibilité est `radio` et non `button` : c'est un choix exclusif,
 * et un lecteur d'écran doit annoncer lequel est retenu. C'est aussi la raison
 * pour laquelle le `Button` du DA ne convenait pas ici.
 */

type Props = {
  sports: readonly Sport[];
  selectedId: string | null;
  onSelect: (sportId: string) => void;
};

export function SportPicker({ sports, selectedId, onSelect }: Props) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {sports.map((sport) => {
        const isSelected = sport.id === selectedId;

        return (
          <Pressable
            key={sport.id}
            onPress={() => onSelect(sport.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={sport.name}
            style={styles.option}
          >
            <SportEmblem icon={sport.icon} size="m" selected={isSelected} />
            <Text
              style={[
                typography.sans.captionSmall,
                isSelected && styles.selectedLabel,
              ]}
              numberOfLines={1}
            >
              {sport.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.block,
  },
  option: {
    alignItems: 'center',
    gap: gap.line,
  },
  selectedLabel: {
    color: colors.text.progress,
  },
});
