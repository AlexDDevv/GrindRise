import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  border,
  colors,
  padding,
  radius,
  toggle,
  touchTarget,
  typography,
} from '../../theme';

/**
 * Interrupteur libellé — maquette 09, composant 07.
 *
 * Écrit à la main plutôt que d'habiller le `Switch` du cœur de React Native :
 * celui-ci n'expose que `trackColor` et `thumbColor`, pas ses dimensions, et la
 * pastille du DA fait 42 × 22 avec un curseur carré-arrondi. Un contrôle
 * natif redimensionné de force serait pire que celui-ci. Les dimensions
 * viennent du jeton `toggle` : le composant n'a aucune géométrie en propre.
 *
 * La pastille ronde est la **seule exception** au « aucun border-radius » du
 * §04, et le DA la nomme explicitement comme telle.
 *
 * L'or est ici un aplat, contrairement au segment actif : enclencher un
 * interrupteur est une action, et le §02 réserve l'aplat d'or aux actions.
 */

type Props = {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export function Switch({ label, value, onValueChange }: Props) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      style={styles.row}
    >
      <Text style={typography.sans.bodySmall}>{label}</Text>

      <View style={[styles.track, value ? styles.trackOn : styles.trackOff]}>
        <View style={[styles.thumb, value ? styles.thumbOn : styles.thumbOff]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: touchTarget.minimum,
    paddingHorizontal: padding.dense.x,
    backgroundColor: colors.surface.raised,
    borderWidth: border.hairline,
    borderColor: colors.line.default,
  },
  track: {
    width: toggle.track.width,
    height: toggle.track.height,
    borderRadius: radius.pill,
    padding: toggle.inset,
    justifyContent: 'center',
  },
  trackOn: {
    backgroundColor: colors.control.toggleOn,
    alignItems: 'flex-end',
  },
  trackOff: {
    backgroundColor: colors.control.track,
    borderWidth: border.hairline,
    borderColor: colors.control.trackBorder,
    alignItems: 'flex-start',
  },
  thumb: {
    width: toggle.thumb,
    height: toggle.thumb,
    borderRadius: radius.pill,
  },
  thumbOn: {
    backgroundColor: colors.control.toggleThumbOn,
  },
  thumbOff: {
    backgroundColor: colors.control.toggleThumbOff,
  },
});
