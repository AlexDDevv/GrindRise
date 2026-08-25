import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '../../../components/Screen';
import { Button, WorkoutCard } from '../../../components/ui';
import { formatDateTime, formatNumber } from '../../../lib/format';
import {
  border,
  colors,
  gap,
  padding,
  spacing,
  typography,
} from '../../../theme';
import type { LogStackParamList, MainTabParamList } from '../../../navigation/types';
import { useLevelCurve } from '../../progression/useLevelCurve';
import { useUserStore } from '../../../store/userStore';
import { WorkoutCelebration } from '../../workouts/WorkoutCelebration';
import type { StrengthStats, WorkoutResult } from '../../workouts/workoutApi';
import { formatDurationLabel } from '../sessionDuration';

/**
 * Séance enregistrée — maquette 09, écran ⑤.
 *
 * Les chiffres affichés sont **ceux du serveur**, jamais ceux calculés
 * localement pendant la séance : ce qu'on annonce est ce qui est stocké.
 *
 * Le tonnage partiel n'est pas un astérisque mais un état. Son étiquette est
 * neutre — aucun or, que le §02 réserve à la progression — et la phrase dit ce
 * qui manque. Aujourd'hui le cas est la **norme** : aucune source de poids de
 * corps n'est branchée côté serveur, donc toute séance comportant une série au
 * poids du corps revient partielle.
 *
 * La séance est déjà écrite quand cet écran s'affiche, et la pile a été `reset`
 * : il n'y a pas de retour arrière vers une séance à renvoyer.
 */
export function StrengthSummaryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LogStackParamList>>();
  const { result } = useRoute<RouteProp<LogStackParamList, 'StrengthSummary'>>().params;

  const progress = useUserStore((s) => s.progress);
  const { curve, progressFor } = useLevelCurve();

  const { workout, xpAwarded, cappedReason, strength } = result;
  const stats = strength?.stats ?? null;

  const durationMin = readDurationMin(workout.metrics);
  const levelAfter = progressFor(
    progress?.level ?? result.levelAfter,
    progress?.current_xp ?? 0,
  );
  const reached = curve?.find((row) => row.level === result.levelAfter);

  /**
   * Deux gestes pour un bouton, et les deux comptent.
   *
   * Le tableau de bord est un onglet, pas une route de cette pile : il faut
   * remonter au navigateur parent pour l'atteindre. Et `popToTop` d'abord,
   * sinon l'onglet « Séance » resterait posé sur ce résumé — `finish` a réduit
   * la pile à `[SportChoice, StrengthSummary]`, la dépiler la rend au sélecteur
   * de sport sans jamais rouvrir la séance envoyée, qui n'y est plus.
   */
  const returnToDashboard = () => {
    navigation.popToTop();
    navigation
      .getParent<BottomTabNavigationProp<MainTabParamList>>()
      ?.navigate('Dashboard');
  };

  return (
    <Screen
      eyebrow="SÉANCE ENREGISTRÉE"
      title={
        durationMin === null
          ? 'Musculation'
          : `Musculation · ${formatDurationLabel(durationMin)}`
      }
      intro={
        cappedReason === 'daily_limit'
          ? 'Deux séances par jour rapportent de l’XP. Celle-ci reste dans ton historique.'
          : cappedReason === 'too_close'
            ? 'Trop proche de la précédente pour compter à part. Elle reste dans ton historique.'
            : 'Une séance de musculation vaut 60 XP, quel que soit le volume.'
      }
      footer={
        <Button
          label="Retour au tableau de bord"
          size="hero"
          onPress={returnToDashboard}
        />
      }
    >
      <WorkoutCard
        variant="detailed"
        sport="Musculation"
        metrics={
          stats === null
            ? []
            : [
                { label: 'Séries', value: formatNumber(stats.totalSets) },
                { label: 'Répétitions', value: formatNumber(stats.totalReps) },
                {
                  label: 'Tonnage',
                  value: formatNumber(stats.tonnageKg),
                  unit: 'kg',
                },
              ]
        }
        loggedAt={formatDateTime(workout.performed_at)}
        xpGain={xpAwarded}
      />

      {stats !== null ? <TonnageNotice stats={stats} /> : null}

      <WorkoutCelebration
        result={result}
        progress={levelAfter}
        levelTitle={reached?.title ?? null}
        levelLore={reached?.unlock_description ?? null}
      />
    </Screen>
  );
}

/**
 * Ce que le tonnage ne dit pas, et pourquoi.
 *
 * Le détail par exercice n'affiche pas les noms : la réponse ne porte que des
 * `exerciseId`, et refaire une lecture du catalogue pour l'écran de fin
 * coûterait une requête à un endroit où l'on ne fait que confirmer. Ce qui est
 * annoncé est donc le nombre d'exercices écartés du tonnage, et non la liste de
 * ceux qu'il faudrait nommer.
 */
function TonnageNotice({ stats }: { stats: StrengthStats }) {
  if (!stats.tonnagePartial) return null;

  const excluded = stats.perExercise.filter((e) => e.tonnagePartial).length;

  return (
    <View style={styles.notice}>
      <View style={styles.noticeHead}>
        <Text style={typography.mono.meta}>TONNAGE</Text>
        <View style={styles.badge}>
          <Text style={typography.mono.meta}>PARTIEL</Text>
        </View>
      </View>

      <Text style={typography.sans.bodySmall}>
        {excluded === 1
          ? 'Un exercice au poids du corps n’est pas compté dans le tonnage : ton poids n’est pas encore renseigné.'
          : `${excluded} exercices au poids du corps ne sont pas comptés dans le tonnage : ton poids n’est pas encore renseigné.`}
      </Text>

      <Text style={typography.sans.caption}>
        Les séries et les répétitions, elles, restent exactes.
      </Text>
    </View>
  );
}

/**
 * La durée relue de la séance écrite.
 *
 * `workout_logs.metrics` est un `jsonb` : rien ne garantit sa forme. Une valeur
 * non numérique est ignorée plutôt que devinée — mieux vaut un titre sans durée
 * qu'un titre faux.
 */
function readDurationMin(metrics: unknown): number | null {
  if (typeof metrics !== 'object' || metrics === null) return null;

  const value = (metrics as Record<string, unknown>).durationMin;

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const styles = StyleSheet.create({
  notice: {
    gap: gap.line,
    paddingVertical: padding.card.y,
    paddingHorizontal: padding.card.x,
    backgroundColor: colors.surface.raised,
    borderWidth: border.hairline,
    borderColor: colors.line.default,
  },
  noticeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.row,
  },
  badge: {
    paddingHorizontal: gap.line,
    // Neutre, sans or : l'or appartient à la progression et reste dans le bloc
    // d'XP. « Partiel » est un état, pas une alerte.
    borderWidth: border.hairline,
    borderColor: colors.line.control,
  },
});
