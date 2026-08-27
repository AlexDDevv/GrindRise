import { Pressable, StyleSheet, Text, View } from 'react-native';

import { border, colors, gap, spacing, typography } from '../../../theme';
import { formatNumber } from '../../../lib/format';
import type { SessionStats } from '../sessionStats';

/**
 * En-tête fixe d'une séance en cours — maquette 09, écran ②.
 *
 * Trois totaux et un chrono, et rien d'autre : c'est ce qu'on regarde entre deux
 * séries. Le tonnage est calculé localement (`sessionStats`), donc en avance de
 * quelques secondes sur le serveur ; le chiffre qui fera foi est celui de
 * l'écran de fin.
 *
 * Le chrono est tappable. Un chrono seul produirait une durée fausse dès qu'on
 * oublie de valider — d'où la correction, à portée là où le nombre s'affiche.
 */

type Props = {
  stats: SessionStats;
  /** Déjà formaté : « 32:14 ». */
  stopwatch: string;
  /**
   * D'où vient la séance : « SÉANCE LIBRE », ou « JOUR PUSH · PUSH PULL LEGS ».
   *
   * Le jour d'abord, le programme ensuite — l'inverse de la ligne « DERNIER »
   * de l'écran de départ. Ici on sait déjà dans quel programme on est, et c'est
   * le jour qu'on relit entre deux séries.
   */
  origin: string;
  onPressStopwatch: () => void;
};

export function SessionStatsHeader({
  stats,
  stopwatch,
  origin,
  onPressStopwatch,
}: Props) {
  return (
    <View style={styles.header}>
      <View style={styles.top}>
        <Text style={styles.origin} numberOfLines={1}>
          {origin}
        </Text>

        <Pressable
          onPress={onPressStopwatch}
          accessibilityRole="button"
          accessibilityLabel={`Durée de la séance, ${stopwatch}`}
          accessibilityHint="Appuie pour corriger la durée"
        >
          <Text style={typography.sans.metricInline}>{stopwatch}</Text>
        </Pressable>
      </View>

      <View style={styles.totals}>
        <Total label="SÉRIES" value={formatNumber(stats.totalSets)} />
        <Total label="RÉPS" value={formatNumber(stats.totalReps)} />
        <Total label="TONNAGE" value={formatNumber(stats.tonnageKg)} unit="kg" />
      </View>
    </View>
  );
}

function Total({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.total}>
      <Text style={typography.mono.meta}>{label}</Text>
      <Text style={typography.sans.metric}>
        {value}
        {unit ? <Text style={typography.sans.unit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: gap.row,
    paddingBottom: spacing.row,
    borderBottomWidth: border.hairline,
    borderBottomColor: colors.line.default,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: gap.row,
  },
  origin: {
    ...typography.mono.meta,
    // Tronqué plutôt que repoussant le chrono : « JOUR PUSH · PUSH PULL LEGS »
    // est bien plus long que « SÉANCE LIBRE », et le chrono ne doit jamais
    // sortir de l'écran.
    flex: 1,
  },
  totals: {
    flexDirection: 'row',
    gap: gap.metrics,
  },
  total: {
    gap: gap.line,
  },
});
