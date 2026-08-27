import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, Text, View } from 'react-native';

import { ErrorNotice, LoadingState } from '../../../components/Feedback';
import { Screen } from '../../../components/Screen';
import { ChipFilter, WorkoutCard } from '../../../components/ui';
import { formatDateTime } from '../../../lib/format';
import { colors, spacing, typography } from '../../../theme';
import { useSports } from '../../sports/useSports';
import { groupByMonth } from '../historySections';
import { useWorkoutHistory } from '../useWorkoutHistory';
import type { LoggedWorkout } from '../workoutFeed';
import { workoutMetrics } from '../workoutSummary';

/**
 * Historique complet, filtrable par sport — feuille de route, étape 3.7.
 *
 * Le tableau de bord s'arrête à cinq séances : au-delà, il n'y avait rien.
 * L'écran n'est pas maquetté — la maquette D1 en dessine seulement l'entrée,
 * « tout voir » à côté d'« Activité récente ». Il est donc dérivé du système
 * existant, et n'invente aucune forme : `WorkoutCard` en variante détaillée,
 * la rangée de puces du catalogue, l'ossature `Screen`.
 *
 * **La carte détaillée plutôt que la compacte**, contrairement au tableau de
 * bord. Celui-ci montre un rythme et doit tenir sous le reste ; ici on vient
 * relire une séance précise, et les trois chiffres valent mieux qu'une ligne de
 * résumé. C'est la première fois que cette variante sert ailleurs que sur la
 * confirmation d'enregistrement — elle avait été écrite pour ça.
 *
 * **Une `SectionList` et non une `FlatList`** : elle apporte les intertitres de
 * mois collants sans état à tenir, et la virtualisation qu'une liste sans fin
 * demande.
 */

export function HistoryScreen() {
  const navigation = useNavigation();
  const { sports, byId: sportsById } = useSports();

  const [sportId, setSportId] = useState<string | null>(null);
  const { workouts, error, hasMore, isLoadingMore, loadMore, reload } =
    useWorkoutHistory(sportId);

  const options = useMemo(
    () => (sports ?? []).map((sport) => ({ value: sport.id, label: sport.name })),
    [sports],
  );

  const sections = useMemo(() => groupByMonth(workouts ?? []), [workouts]);

  return (
    <Screen
      eyebrow="TOUTES TES SÉANCES"
      title="Historique"
      onBack={() => navigation.goBack()}
      // La liste gère son propre défilement : `SectionList` virtualise, ce
      // qu'un `ScrollView` parent annulerait en la rendant tout entière.
      scroll={false}
    >
      {options.length > 0 ? (
        <View style={styles.filter}>
          <ChipFilter options={options} value={sportId} onChange={setSportId} />
        </View>
      ) : null}

      {error ? <ErrorNotice message={error} onRetry={() => void reload()} /> : null}

      {workouts === null && !error ? <LoadingState /> : null}

      {workouts !== null ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.log.id}
          // `Screen` sans défilement pose un conteneur en colonne : sans cette
          // hauteur, la liste se dimensionnerait à son contenu et déborderait
          // au lieu de défiler.
          style={styles.fill}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled
          // Un demi-écran d'avance : assez pour que la page suivante arrive
          // avant qu'on touche le fond, pas assez pour la charger d'emblée.
          onEndReachedThreshold={0.5}
          onEndReached={() => void loadMore()}
          ListEmptyComponent={
            <Text style={typography.sans.bodySmall}>
              {sportId === null
                ? 'Rien encore. Ta première séance ouvrira le compteur.'
                : 'Aucune séance dans ce sport. Change de filtre pour voir les autres.'}
            </Text>
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={typography.mono.label}>{section.label}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <HistoryCard workout={item} sportName={sportsById.get(item.log.sport_id)?.name} />
          )}
          ListFooterComponent={
            isLoadingMore ? (
              <ActivityIndicator color={colors.accent.gold} style={styles.footer} />
            ) : workouts.length > 0 && !hasMore ? (
              <Text style={[typography.sans.caption, styles.footer]}>
                Tu es remonté jusqu'à ta première séance.
              </Text>
            ) : null
          }
        />
      ) : null}
    </Screen>
  );
}

function HistoryCard({
  workout,
  sportName,
}: {
  workout: LoggedWorkout;
  /** Nul le temps que le catalogue arrive : l'identifiant reste lisible. */
  sportName?: string;
}) {
  const { log, xpGain, strength } = workout;

  return (
    <View style={styles.card}>
      <WorkoutCard
        variant="detailed"
        sport={sportName ?? log.sport_id}
        // Trois époques de séances passent par cette liste — structurée,
        // formulaire plat, musculation d'avant la refonte — et `workoutMetrics`
        // les distingue à un seul endroit.
        metrics={workoutMetrics(log.sport_id, log.metrics, strength)}
        loggedAt={formatDateTime(log.performed_at)}
        xpGain={xpGain}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  filter: {
    // `ChipFilter` porte sa propre marge latérale pour défiler bord à bord ;
    // `Screen` en pose déjà une. La neutraliser ici évite un double retrait.
    marginHorizontal: -spacing.screen,
  },
  fill: {
    flex: 1,
  },
  list: {
    paddingBottom: spacing.block,
  },
  sectionHeader: {
    paddingTop: spacing.block,
    paddingBottom: spacing.row,
    // Opaque : l'intertitre est collant, et une séance défilant dessous se
    // lirait à travers.
    backgroundColor: colors.surface.page,
  },
  card: {
    paddingBottom: spacing.row,
  },
  footer: {
    paddingTop: spacing.block,
    textAlign: 'center',
  },
});
