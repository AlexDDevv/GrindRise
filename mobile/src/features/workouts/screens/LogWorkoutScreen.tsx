import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { MetricField } from '../sportMetrics';
import { useLogWorkout, type Sport, type WorkoutResult } from '../useLogWorkout';

export function LogWorkoutScreen() {
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

  if (result) {
    return <WorkoutSummary result={result} onDismiss={reset} />;
  }

  if (loadError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error} accessibilityRole="alert">
          {loadError}
        </Text>
        <Pressable
          onPress={() => void reloadSports()}
          accessibilityRole="button"
          style={styles.button}
        >
          <Text style={styles.buttonLabel}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }

  if (!sports) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Sport</Text>
        <View style={styles.sportRow}>
          {sports.map((sport) => (
            <SportChip
              key={sport.id}
              sport={sport}
              isSelected={sport.id === sportId}
              onPress={() => selectSport(sport.id)}
            />
          ))}
        </View>

        {fields.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Séance</Text>
            {fields.map((field) => (
              <MetricInput
                key={field.key}
                field={field}
                value={values[field.key] ?? ''}
                onChange={(text) => setValue(field.key, text)}
              />
            ))}
          </>
        ) : (
          <Text style={styles.hint}>
            Ce sport ne demande aucune métrique : la présence suffit.
          </Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {submitError ? (
          <Text style={styles.error} accessibilityRole="alert">
            {submitError}
          </Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            !canSubmit && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => void submit()}
          disabled={!canSubmit}
          accessibilityRole="button"
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonLabel}>Enregistrer</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

type SportChipProps = {
  sport: Sport;
  isSelected: boolean;
  onPress: () => void;
};

function SportChip({ sport, isSelected, onPress }: SportChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, isSelected && styles.chipSelected]}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
    >
      <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>
        {sport.name}
      </Text>
    </Pressable>
  );
}

type MetricInputProps = {
  field: MetricField;
  value: string;
  onChange: (text: string) => void;
};

function MetricInput({ field, value, onChange }: MetricInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {field.label}
        {field.unit ? ` (${field.unit})` : ''}
        {field.required ? '' : ' — facultatif'}
      </Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder={field.placeholder}
        placeholderTextColor="#aaa"
        // `decimal-pad` plutôt que `numeric` : pas de signe ni d'exposant, et
        // les entiers passent aussi par ce clavier.
        keyboardType={field.integer ? 'number-pad' : 'decimal-pad'}
        accessibilityLabel={field.label}
        returnKeyType="done"
      />
    </View>
  );
}

/**
 * Confirmation du gain.
 *
 * Volontairement sobre : une phrase, un chiffre, un détail repliable dans le
 * texte. La mise en scène du passage de niveau est un sujet de phase 3, et une
 * animation posée ici serait à refaire.
 */
function WorkoutSummary({
  result,
  onDismiss,
}: {
  result: WorkoutResult;
  onDismiss: () => void;
}) {
  const { xpAwarded, breakdown, leveledUp, levelAfter, cappedReason, unlockedBeats } =
    result;

  return (
    <View style={styles.centered}>
      <Text style={styles.summaryTitle}>Séance enregistrée</Text>

      {cappedReason ? (
        <>
          <Text style={styles.summaryXp}>+0 XP</Text>
          <Text style={styles.summaryDetail}>
            {cappedReason === 'daily_limit'
              ? 'Deux séances par jour rapportent de l’XP. Celle-ci reste dans ton historique.'
              : 'Trop proche de la précédente pour compter à part. Elle reste dans ton historique.'}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.summaryXp}>+{xpAwarded} XP</Text>
          <Text style={styles.summaryDetail}>
            {breakdown.attendance} de présence
            {breakdown.effort > 0 ? `, ${breakdown.effort} d’effort` : ''}
            {breakdown.streak > 0 ? `, ${breakdown.streak} de série` : ''}
          </Text>
          {leveledUp ? (
            <Text style={styles.summaryLevel}>Niveau {levelAfter} atteint.</Text>
          ) : null}
        </>
      )}

      {/* Annoncé, pas raconté : le texte se lit dans le codex, seul endroit qui
          date la première consultation. Une séance plafonnée peut quand même
          ouvrir un fragment — le déblocage compte les séances, pas l'XP. */}
      {unlockedBeats > 0 ? (
        <Text style={styles.summaryDetail}>
          {unlockedBeats > 1
            ? `${unlockedBeats} nouveaux fragments t’attendent dans le codex.`
            : 'Un nouveau fragment t’attend dans le codex.'}
        </Text>
      ) : null}

      <Pressable onPress={onDismiss} accessibilityRole="button" style={styles.button}>
        <Text style={styles.buttonLabel}>Nouvelle séance</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: '#fff',
  },
  form: {
    gap: 12,
    padding: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
  },
  sportRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  chipSelected: {
    borderColor: '#1c1c1e',
    backgroundColor: '#1c1c1e',
  },
  chipLabel: {
    fontSize: 15,
    color: '#333',
  },
  chipLabelSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 14,
    color: '#555',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    minHeight: 48,
  },
  hint: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  footer: {
    gap: 10,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  error: {
    color: '#b3261e',
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#1c1c1e',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  summaryXp: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  summaryDetail: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  summaryLevel: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
});
