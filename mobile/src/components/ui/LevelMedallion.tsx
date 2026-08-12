import { StyleSheet, Text, View } from 'react-native';

import {
  colors,
  diamond,
  gradient,
  medallionSize,
  typography,
  type MedallionSize,
} from '../../theme';
import { Hexagon } from './Hexagon';

/**
 * Médaillon de niveau — `Composants detail.dc.html` 03.
 *
 * Trois tailles selon l'endroit : `s` en liste, `m` au dashboard, `l` au
 * profil. `ceremony` est le médaillon plein du level-up — l'or y devient un
 * aplat et le chiffre passe en encre sombre, une fois par palier.
 *
 * `locked` remplace le chiffre par un losange : le niveau existe, il n'est pas
 * encore atteint.
 */

type Props = {
  level: number;
  size?: MedallionSize;
  locked?: boolean;
};

export function LevelMedallion({ level, size = 'm', locked = false }: Props) {
  const box = medallionSize[size];
  const type = typography.medallion[size];
  // Sans cœur imbriqué, l'or est un aplat : le chiffre doit alors s'y creuser
  // en encre sombre plutôt que se poser en clair.
  const isSolid = box.inner === null;

  return (
    <Hexagon
      width={box.width}
      fill={locked ? colors.medallion.frameLocked : isSolid ? gradient.medallionSolid : gradient.medallionFrame}
      inner={box.inner ? { ...box.inner, color: colors.medallion.core } : null}
    >
      <View
        style={styles.engraving}
        accessibilityRole="image"
        accessibilityLabel={locked ? `Niveau ${level}, verrouillé` : `Niveau ${level}`}
      >
        {locked ? (
          <View style={styles.diamond} />
        ) : (
          <>
            {type.caption ? <Text style={type.caption}>NIV</Text> : null}
            <Text
              style={[
                type.numeral,
                { color: isSolid ? colors.medallion.numeralOnSolid : colors.medallion.numeral },
              ]}
            >
              {level}
            </Text>
          </>
        )}
      </View>
    </Hexagon>
  );
}

const styles = StyleSheet.create({
  engraving: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  diamond: {
    width: diamond.locked.size,
    height: diamond.locked.size,
    borderWidth: diamond.locked.stroke,
    borderColor: colors.medallion.lockedGlyph,
    transform: [{ rotate: '45deg' }],
  },
});
