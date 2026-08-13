import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '../../../components/Screen';
import { Button, LevelMedallion } from '../../../components/ui';
import { formatNumber } from '../../../lib/format';
import { supabase } from '../../../lib/supabase';
import { useUserStore } from '../../../store/userStore';
import { border, colors, gap, padding, spacing, typography } from '../../../theme';
import { useGameClass } from '../../onboarding/useClasses';
import { useLevelCurve } from '../../progression/useLevelCurve';
import { streakStatus } from '../../dashboard/streak';

/**
 * Profil : l'identité du joueur, et la sortie.
 *
 * Volontairement en lecture seule. Le pseudo, l'historique complet et les
 * analytics de stagnation ont chacun leur étape ; les esquisser ici produirait
 * des écrans à refaire. Ce que cette page doit tenir aujourd'hui, c'est ce que
 * le joueur est — sa classe et son palier — et de quoi se déconnecter.
 *
 * La déconnexion ne navigue pas : `signOut` ferme la session, `useAuthBootstrap`
 * l'observe et vide le store, et le `RootNavigator` remonte l'onboarding de
 * lui-même. Une navigation impérative en plus ferait deux transitions.
 */
export function ProfileScreen() {
  const profile = useUserStore((s) => s.profile);
  const progress = useUserStore((s) => s.progress);
  const gameClass = useGameClass(profile?.class_id ?? null);
  const { progressFor } = useLevelCurve();

  const level = progressFor(progress?.level ?? 1, progress?.current_xp ?? 0);
  const streak = streakStatus(progress?.streak_days ?? 0, progress?.last_workout_on ?? null);

  return (
    <Screen
      eyebrow="PROFIL"
      title={profile?.username ?? 'Sans nom'}
      footer={
        <Button
          label="Se déconnecter"
          variant="secondary"
          onPress={() => void supabase.auth.signOut()}
        />
      }
    >
      <View style={styles.identity}>
        <LevelMedallion level={level?.level ?? progress?.level ?? 1} size="l" />

        <View style={styles.identityText}>
          <Text style={typography.mono.eyebrow}>PALIER</Text>
          <Text style={typography.display.cardTitle}>
            {level?.title || `Niveau ${progress?.level ?? 1}`}
          </Text>
        </View>
      </View>

      {gameClass ? (
        <View style={styles.panel}>
          <Text style={typography.mono.label}>VOIE CHOISIE</Text>
          <Text style={typography.display.cardTitle}>{gameClass.name}</Text>
          <Text style={typography.display.lore}>{gameClass.lore_intro}</Text>
        </View>
      ) : null}

      <View style={styles.stats}>
        <Stat label="XP TOTAL" value={formatNumber(progress?.current_xp ?? 0)} />
        <Stat
          label="SÉRIE"
          value={formatNumber(streak.days)}
          unit={streak.days === 1 ? 'jour' : 'jours'}
        />
      </View>
    </Screen>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={typography.mono.label}>{label}</Text>
      <View style={styles.statValue}>
        <Text style={typography.sans.metric}>{value}</Text>
        {unit ? <Text style={typography.sans.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.block,
  },
  identityText: {
    flex: 1,
    gap: gap.line,
  },
  panel: {
    gap: gap.row,
    paddingVertical: padding.card.y,
    paddingHorizontal: padding.card.x,
    backgroundColor: colors.surface.raised,
    borderWidth: border.hairline,
    borderColor: colors.line.default,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.block,
  },
  stat: {
    flex: 1,
    gap: gap.line,
    paddingVertical: padding.card.y,
    paddingHorizontal: padding.card.x,
    backgroundColor: colors.surface.raised,
    borderWidth: border.hairline,
    borderColor: colors.line.default,
  },
  statValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: gap.line,
  },
});
