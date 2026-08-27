import { Pressable, StyleSheet, Text, View } from 'react-native';

import { border, colors, gap, medallionSize, padding, sportGlyph, typography } from '../../theme';
import { Hexagon } from './Hexagon';

/**
 * Carte de séance loggée — `Composants detail.dc.html` 04.
 *
 * Deux densités pour la même séance : `compact` en liste de dashboard, où seul
 * compte le fait qu'elle a eu lieu, et `detailed` en historique, où les
 * métriques se lisent d'un coup d'œil.
 *
 * Les métriques ne sont pas nommées ici : c'est l'appelant qui décide de quoi
 * parle une séance — volume et séries en musculation, distance et allure en
 * course. La carte se contente de les aligner.
 */

export type WorkoutMetric = {
  label: string;
  value: string;
  /** Unité accolée, en plus petit : « kg », « km », « /km ». */
  unit?: string;
};

type Props = {
  sport: string;
  /** Gain d'XP de la séance. */
  xpGain: number;
  onPress?: () => void;
} & (
  | {
      variant: 'compact';
      /** Résumé d'une ligne : « Hier · 52 min · 4 120 kg ». */
      summary: string;
    }
  | {
      variant: 'detailed';
      metrics: readonly WorkoutMetric[];
      /** Horodatage en toutes lettres : « Lundi 10 août · 19 h 40 ». */
      loggedAt: string;
    }
);

export function WorkoutCard(props: Props) {
  const { sport, xpGain, onPress } = props;
  const body = props.variant === 'compact' ? <CompactBody {...props} /> : <DetailedBody {...props} />;

  if (!onPress) {
    return <View style={styles.card}>{body}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${sport}, ${xpGain} XP`}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {body}
    </Pressable>
  );
}

function CompactBody({ sport, summary, xpGain }: Extract<Props, { variant: 'compact' }>) {
  return (
    <View style={styles.compact}>
      {/*
        Hexagone d'icône de sport, à la taille des médaillons de liste. Le
        glyphe définitif fait partie des illustrations que le §07 du DA laisse
        à produire : la barre est le placeholder de Composants detail 04.
      */}
      <Hexagon width={medallionSize.s.width} fill={colors.workoutCard.glyphBackground}>
        <View style={styles.sportGlyphBar} />
      </Hexagon>

      <View style={styles.compactText}>
        <Text style={typography.display.cardTitleCompact}>{sport}</Text>
        <Text style={typography.sans.caption}>{summary}</Text>
      </View>

      <Text style={[typography.sans.metricGain, styles.xpGain]}>+{xpGain}</Text>
    </View>
  );
}

function DetailedBody({
  sport,
  metrics,
  loggedAt,
  xpGain,
}: Extract<Props, { variant: 'detailed' }>) {
  return (
    <>
      <View style={styles.header}>
        <Text style={typography.display.cardTitle}>{sport}</Text>
        <Text style={[typography.sans.metricGain, styles.xpGain]}>+{xpGain} XP</Text>
      </View>

      {/* Une bande vide se dessinerait quand même — filets, hauteur, fond — et
          se lirait comme une donnée manquante plutôt qu'absente. Le cas existe :
          une séance de musculation d'avant la refonte n'a ni exercices ni
          métriques que la config sache relire. */}
      {metrics.length === 0 ? null : (
      <View style={styles.metrics}>
        {metrics.map((metric) => (
          <View key={metric.label} style={styles.metric}>
            <Text style={typography.sans.metricLabel}>{metric.label.toUpperCase()}</Text>
            <Text style={typography.sans.metric}>
              {metric.value}
              {metric.unit ? <Text style={typography.sans.unit}> {metric.unit}</Text> : null}
            </Text>
          </View>
        ))}
      </View>
      )}

      <View style={styles.footer}>
        <Text style={typography.sans.captionSmall}>{loggedAt}</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.workoutCard.background,
    borderWidth: border.hairline,
    borderColor: colors.line.default,
  },
  cardPressed: {
    borderColor: colors.line.control,
  },

  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: gap.row,
    paddingVertical: padding.card.y,
    paddingHorizontal: padding.card.x,
  },
  compactText: {
    flex: 1,
    gap: gap.line,
  },
  sportGlyphBar: {
    width: sportGlyph.barWidth,
    height: sportGlyph.barHeight,
    backgroundColor: colors.workoutCard.glyph,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: padding.card.y,
    paddingHorizontal: padding.card.x,
    borderBottomWidth: border.hairline,
    borderBottomColor: colors.line.default,
    backgroundColor: colors.workoutCard.headerBackground,
  },
  metrics: {
    flexDirection: 'row',
    gap: gap.metrics,
    paddingVertical: padding.card.y,
    paddingHorizontal: padding.card.x,
  },
  metric: {
    gap: gap.line,
  },
  footer: {
    paddingVertical: padding.cardFooter.y,
    paddingHorizontal: padding.cardFooter.x,
    borderTopWidth: border.hairline,
    borderTopColor: colors.line.default,
    borderStyle: 'dashed',
  },
  xpGain: {
    color: colors.workoutCard.xpGain,
  },
});
