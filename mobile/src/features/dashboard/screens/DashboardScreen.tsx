import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';

import { ErrorNotice, LoadingState } from '../../../components/Feedback';
import { Screen } from '../../../components/Screen';
import { Button, LevelMedallion, WorkoutCard, XpBar } from '../../../components/ui';
import { formatNumber } from '../../../lib/format';
import type {
  DashboardStackParamList,
  MainTabParamList,
} from '../../../navigation/types';
import { useUserStore } from '../../../store/userStore';
import {
  border,
  colors,
  gap,
  padding,
  spacing,
  typography,
} from '../../../theme';
import { useLevelCurve } from '../../progression/useLevelCurve';
import { useSports } from '../../sports/useSports';
import {
  summarizeStrengthWorkout,
  summarizeWorkout,
} from '../../workouts/workoutSummary';
import { streakStatus } from '../streak';
import { useRecentWorkouts, type RecentWorkout } from '../useRecentWorkouts';

/**
 * Accueil : où en est le joueur, et l'action qui l'y fait avancer.
 *
 * La progression vient du store et non d'une requête. Ce n'est pas une économie
 * de réseau mais une question d'autorité : `POST /workouts` renvoie la
 * progression issue de la transaction qui vient d'écrire l'XP, et le store la
 * pose. Relire `user_progress` ici pourrait rendre une valeur plus ancienne que
 * celle qu'on vient d'afficher au joueur.
 *
 * L'activité récente, elle, est bien relue à chaque retour sur l'onglet : le
 * store ne porte pas l'historique.
 */
export function DashboardScreen() {
  // Deux navigateurs depuis cet écran : la barre d'onglets pour aller loguer une
  // séance, et sa propre pile pour dérouler l'historique. Le type composé les
  // expose tous les deux sans avoir à en traverser un pour joindre l'autre.
  const navigation =
    useNavigation<
      CompositeNavigationProp<
        NativeStackNavigationProp<DashboardStackParamList, 'DashboardHome'>,
        BottomTabNavigationProp<MainTabParamList>
      >
    >();

  const progress = useUserStore((s) => s.progress);
  const { progressFor, error: curveError, reload: reloadCurve } = useLevelCurve();
  const { byId: sportsById } = useSports();
  const { workouts, error: workoutsError, reload: reloadWorkouts } = useRecentWorkouts();

  // `user_progress` est posé par le trigger de création : son absence est un
  // incident de lecture, pas un compte neuf. Un niveau 1 vide serait faux.
  const level = progressFor(progress?.level ?? 1, progress?.current_xp ?? 0);
  const streak = streakStatus(progress?.streak_days ?? 0, progress?.last_workout_on ?? null);

  return (
    <Screen>
      {curveError ? <ErrorNotice message={curveError} onRetry={reloadCurve} /> : null}

      {level ? (
        <View style={styles.panel}>
          <View style={styles.identity}>
            <LevelMedallion level={level.level} size="m" />

            <View style={styles.identityText}>
              <Text style={typography.mono.eyebrow}>TON PALIER</Text>
              <Text style={typography.display.hero}>{level.title}</Text>
            </View>
          </View>

          <XpBar
            value={level.gauge.value}
            max={level.gauge.max}
            caption={
              level.atMaximum
                ? 'Dernier palier de la courbe atteint.'
                : `${formatNumber(level.xpInLevel)} / ${formatNumber(level.xpForLevel)} XP vers le niveau ${level.nextLevel}`
            }
          />

          <View style={styles.streak}>
            <Text style={typography.mono.label}>SÉRIE</Text>
            <View style={styles.streakValue}>
              <Text style={typography.sans.metric}>{formatNumber(streak.days)}</Text>
              <Text style={typography.sans.unit}>
                {streak.days === 1 ? 'jour' : 'jours'}
              </Text>
            </View>
            <Text style={typography.sans.captionSmall}>{streakCaption(streak)}</Text>
          </View>
        </View>
      ) : (
        <LoadingState />
      )}

      <Button
        label="Logger une séance"
        size="hero"
        onPress={() => navigation.navigate('Log')}
      />

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={typography.mono.label}>ACTIVITÉ RÉCENTE</Text>

          {/* « tout voir » de la maquette D1 : les cinq dernières séances
              suffisent à montrer un rythme, pas à relire un mois. Caché tant
              qu'il n'y a rien derrière — un lien vers une liste vide ne
              promet rien de bon. */}
          {workouts && workouts.length > 0 ? (
            <Button
              label="Tout voir"
              variant="tertiary"
              size="compact"
              onPress={() => navigation.navigate('History')}
            />
          ) : null}
        </View>

        {workoutsError ? (
          <ErrorNotice message={workoutsError} onRetry={reloadWorkouts} />
        ) : null}

        {workouts === null ? <LoadingState /> : null}

        {workouts?.length === 0 ? (
          <Text style={typography.sans.bodySmall}>
            Rien encore. Ta première séance ouvrira le compteur.
          </Text>
        ) : null}

        <View style={styles.list}>
          {workouts?.map((workout) => (
            <RecentWorkoutCard
              key={workout.log.id}
              workout={workout}
              sportName={sportsById.get(workout.log.sport_id)?.name}
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}

/** Ce que la série mérite qu'on en dise, et rien de plus. */
function streakCaption({ days, isToday, isAtRisk }: ReturnType<typeof streakStatus>): string {
  if (days === 0) return 'Une séance aujourd’hui démarre une nouvelle série.';
  if (isAtRisk) return 'Elle tient jusqu’à ce soir. Une séance la prolonge.';
  if (isToday) return 'Séance du jour faite.';

  return '';
}

function RecentWorkoutCard({
  workout,
  sportName,
}: {
  workout: RecentWorkout;
  /** Nul le temps que le catalogue arrive : l'identifiant reste lisible. */
  sportName?: string;
}) {
  const { log, xpGain, strength } = workout;

  return (
    <WorkoutCard
      variant="compact"
      sport={sportName ?? log.sport_id}
      summary={
        // Une séance à log structuré ne se résume pas par `metrics` : sa
        // description est dans `logged_exercises`, et `SPORT_METRIC_FIELDS` n'a
        // plus d'entrée pour elle.
        strength === null
          ? summarizeWorkout(log.sport_id, log.metrics, log.performed_at)
          : summarizeStrengthWorkout(strength, log.performed_at)
      }
      xpGain={xpGain}
    />
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.block,
    paddingVertical: padding.card.y,
    paddingHorizontal: padding.card.x,
    backgroundColor: colors.surface.raised,
    borderWidth: border.hairline,
    borderColor: colors.line.default,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: gap.row,
  },
  identityText: {
    flex: 1,
    gap: gap.line,
  },
  streak: {
    gap: gap.line,
    paddingTop: spacing.row,
    borderTopWidth: border.hairline,
    borderTopColor: colors.line.default,
  },
  streakValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: gap.line,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  section: {
    gap: spacing.list,
  },
  list: {
    gap: spacing.list,
  },
});
