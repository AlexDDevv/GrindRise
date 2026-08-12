import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { formatNumber } from '../../lib/format';
import { border, colors, glow, gradient, spacing, typography, xpBar } from '../../theme';

/**
 * Barre d'XP — `Composants detail.dc.html` 02.
 *
 * Jauge fine, jamais arrondie, lueur or sur le remplissage. La lueur est
 * portée par le remplissage et non par la piste : elle reste donc contenue
 * dans la jauge, comme dans le DA, et s'intensifie au palier complet.
 *
 * Sans `title` ni `caption`, le composant se réduit à la jauge nue, celle qui
 * se pose à l'intérieur d'une carte ou d'une modale.
 */

type Props = {
  value: number;
  max: number;
  /** Nom du palier, posé à gauche au-dessus de la jauge. */
  title?: string;
  /** Légende sous la jauge : ce qu'il reste à parcourir. */
  caption?: string;
};

export function XpBar({ value, max, title, caption }: Props) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const isComplete = ratio >= 1;

  return (
    <View style={styles.container}>
      {title ? (
        <View style={styles.header}>
          <Text style={typography.display.cardTitle}>{title}</Text>
          <Text style={typography.sans.metricInline}>
            {formatNumber(value)} / {formatNumber(max)}
          </Text>
        </View>
      ) : null}

      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max, now: value }}
      >
        <LinearGradient
          colors={[...gradient.xpFill.colors]}
          start={gradient.xpFill.start}
          end={gradient.xpFill.end}
          style={[
            styles.fill,
            { width: `${ratio * 100}%`, boxShadow: [isComplete ? glow.xpComplete : glow.xp] },
          ]}
        />
      </View>

      {caption ? <Text style={typography.sans.captionSmall}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.row,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  track: {
    height: xpBar.height,
    backgroundColor: colors.xp.track,
    borderWidth: border.hairline,
    borderColor: colors.line.default,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
