import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';

import { ErrorNotice, LoadingState } from '../../../components/Feedback';
import { Screen } from '../../../components/Screen';
import { TextField } from '../../../components/TextField';
import { Button, WorkoutCard } from '../../../components/ui';
import { formatDateTime, formatNumber } from '../../../lib/format';
import type { LogStackParamList } from '../../../navigation/types';
import { useUserStore } from '../../../store/userStore';
import { spacing, typography } from '../../../theme';
import { useLevelCurve } from '../../progression/useLevelCurve';
import { SportPicker } from '../../sports/SportPicker';
import type { Sport } from '../../sports/useSports';
import { STRENGTH_SPORT_ID } from '../../strength/toWorkoutPayload';
import { useStrengthSessionStore } from '../../strength/strengthSessionStore';
import type { MetricField } from '../sportMetrics';
import { useLogWorkout, type WorkoutResult } from '../useLogWorkout';
import { WorkoutCelebration } from '../WorkoutCelebration';
import { readMetrics } from '../workoutSummary';

/**
 * Enregistrement d'une séance.
 *
 * Le formulaire est entièrement dérivé de `SPORT_METRIC_FIELDS` : il n'y a pas
 * un rendu par sport, mais une liste de champs rendue de la même façon quelle
 * que soit la discipline. Ajouter un sport, c'est ajouter une entrée dans cette
 * config — le formulaire, l'historique et le résumé le suivent sans qu'une ligne
 * de rendu soit à écrire ici.
 *
 * L'écran a deux états et pas deux routes : le formulaire, puis la confirmation.
 * Une route séparée pour la confirmation permettrait d'y revenir par le retour
 * arrière, et de relire un gain déjà encaissé comme s'il venait d'arriver.
 *
 * **La musculation bifurque, elle ne se saisit plus ici.** Depuis la refonte du
 * serveur, une séance de musculation se logue en exercices et en séries, sur
 * `StrengthSession`. Choisir « musculation » dans le `SportPicker` ne pousse
 * pas cet écran pour autant : la section des métriques devient une invitation
 * explicite, et c'est un appui sur son bouton qui ouvre la pile. Une navigation
 * automatique au choix du sport serait désorientante au retour sur l'onglet.
 */
export function LogWorkoutScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LogStackParamList>>();
  const startSession = useStrengthSessionStore((s) => s.start);

  const {
    sports,
    loadError,
    reloadSports,
    sportId,
    selectSport,
    fields,
    values,
    setValue,
    canSubmit,
    isSubmitting,
    submitError,
    submit,
    result,
    reset,
  } = useLogWorkout();

  const isStrength = sportId === STRENGTH_SPORT_ID;

  if (result) {
    return <WorkoutConfirmation result={result} onDismiss={reset} sports={sports} />;
  }

  return (
    <Screen
      eyebrow="NOUVELLE SÉANCE"
      title="Ce que tu viens de faire"
      avoidKeyboard
      footer={
        // Le bouton d'enregistrement du formulaire plat n'a pas de sens pour la
        // musculation : elle s'enregistre à la fin de la séance structurée, pas
        // ici.
        isStrength ? null : (
          <>
            {submitError ? <ErrorNotice message={submitError} /> : null}

            <Button
              label={isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
              size="hero"
              onPress={() => void submit()}
              disabled={!canSubmit}
            />
          </>
        )
      }
    >
      {loadError ? <ErrorNotice message={loadError} onRetry={reloadSports} /> : null}

      {!sports && !loadError ? <LoadingState /> : null}

      {sports ? (
        <View style={styles.section}>
          <Text style={typography.mono.label}>DISCIPLINE</Text>
          <SportPicker sports={sports} selectedId={sportId} onSelect={selectSport} />
        </View>
      ) : null}

      {isStrength ? (
        <View style={styles.section}>
          <Text style={typography.mono.label}>SÉANCE STRUCTURÉE</Text>
          <Text style={typography.sans.bodySmall}>
            La musculation se logue en exercices et en séries. Une séance vaut
            60 XP, quel que soit le volume.
          </Text>
          <Button
            label="Commencer la séance"
            size="hero"
            onPress={() => {
              // Le chrono part ici et non à l'ajout du premier exercice : la
              // séance a commencé quand on ouvre l'écran, pas quand on trouve
              // son premier mouvement dans le catalogue.
              startSession();
              navigation.navigate('StrengthSession');
            }}
          />
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={typography.mono.label}>MÉTRIQUES</Text>

          {fields.length > 0 ? (
            fields.map((field) => (
              <MetricInput
                key={field.key}
                field={field}
                value={values[field.key] ?? ''}
                onChange={(text) => setValue(field.key, text)}
              />
            ))
          ) : (
            <Text style={typography.sans.bodySmall}>
              Ce sport ne demande aucune métrique : la présence suffit.
            </Text>
          )}
        </View>
      )}
    </Screen>
  );
}

function MetricInput({
  field,
  value,
  onChange,
}: {
  field: MetricField;
  value: string;
  onChange: (text: string) => void;
}) {
  return (
    <TextField
      label={field.label}
      unit={field.unit}
      optional={!field.required}
      value={value}
      onChangeText={onChange}
      placeholder={field.placeholder}
      // `decimal-pad` plutôt que `numeric` : pas de signe ni d'exposant, et les
      // entiers passent aussi par ce clavier.
      keyboardType={field.integer ? 'number-pad' : 'decimal-pad'}
      returnKeyType="done"
    />
  );
}

/**
 * Confirmation de la séance.
 *
 * La séance est rendue par la carte détaillée du DA, celle de l'historique : ce
 * que le joueur valide ici est exactement ce qu'il relira demain. Les annonces
 * de palier et de fragment se posent par-dessus, en modale, et n'empêchent pas
 * de lire la confirmation en dessous.
 */
function WorkoutConfirmation({
  result,
  onDismiss,
  sports,
}: {
  result: WorkoutResult;
  onDismiss: () => void;
  sports: readonly Sport[] | null;
}) {
  const progress = useUserStore((s) => s.progress);
  const { curve, progressFor } = useLevelCurve();

  const { workout, xpAwarded, breakdown, cappedReason } = result;
  const sportName = sports?.find((sport) => sport.id === workout.sport_id)?.name;

  const levelAfter = progressFor(progress?.level ?? result.levelAfter, progress?.current_xp ?? 0);
  const reached = curve?.find((row) => row.level === result.levelAfter);

  return (
    <Screen
      eyebrow="SÉANCE ENREGISTRÉE"
      title={cappedReason ? 'Elle compte, sans XP' : `+${formatNumber(xpAwarded)} XP`}
      intro={
        cappedReason === 'daily_limit'
          ? 'Deux séances par jour rapportent de l’XP. Celle-ci reste dans ton historique.'
          : cappedReason === 'too_close'
            ? 'Trop proche de la précédente pour compter à part. Elle reste dans ton historique.'
            : detailOf(breakdown)
      }
      footer={<Button label="Nouvelle séance" size="hero" onPress={onDismiss} />}
    >
      <WorkoutCard
        variant="detailed"
        sport={sportName ?? workout.sport_id}
        metrics={readMetrics(workout.sport_id, workout.metrics)}
        loggedAt={formatDateTime(workout.performed_at)}
        xpGain={xpAwarded}
      />

      <WorkoutCelebration
        result={result}
        progress={levelAfter}
        levelTitle={reached?.title ?? null}
        levelLore={reached?.unlock_description ?? null}
      />
    </Screen>
  );
}

/** D'où vient l'XP de la séance. Les postes nuls ne sont pas mentionnés. */
function detailOf(breakdown: WorkoutResult['breakdown']): string {
  const parts = [`${breakdown.attendance} de présence`];

  if (breakdown.effort > 0) parts.push(`${breakdown.effort} d’effort`);
  if (breakdown.streak > 0) parts.push(`${breakdown.streak} de série`);

  return parts.join(', ');
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.row,
  },
});
