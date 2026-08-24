import { Pressable, StyleSheet, Text, View } from 'react-native';

import { border, colors, gap, padding, setRow, touchTarget, typography } from '../../../theme';
import { summarizeExercise } from '../sessionStats';
import type { SessionExercise } from '../types';
import { SetRow } from './SetRow';

/**
 * Carte d'un exercice en saisie — maquette 09, composant 08.
 *
 * Deux états pour la même carte : dépliée, elle aligne ses séries et propose
 * d'en ajouter ; repliée, elle se réduit à son nom et à un résumé. Le résumé
 * **ne donne jamais de tonnage** — il serait incomplet au poids du corps, et
 * une carte repliée n'a pas la place d'expliquer pourquoi.
 *
 * L'en-tête de colonne porte l'état : `RÉPÉTITIONS` ou `TEMPS`, `CHARGE` ou
 * `LEST`, dérivés de la dernière série saisie. C'est la maquette qui le
 * prescrit, et ça évite un endroit de plus où l'état serait dupliqué.
 *
 * La carte ne connaît ni le store, ni la navigation, ni les confirmations : la
 * suppression remonte en callback, et c'est l'écran qui décide d'un `Alert`.
 * Sans ça, la carte ne serait pas rendable ailleurs.
 */

type Props = {
  exercise: SessionExercise;
  /** Faux au plafond de 20 séries : le bouton s'éteint au lieu de prendre un 400. */
  canAddSet: boolean;
  onAddSet: () => void;
  onPressSet: (index: number) => void;
  onLongPressSet: (index: number) => void;
  onToggleCollapsed: () => void;
  onLongPressHeader: () => void;
};

export function ExerciseCard({
  exercise,
  canAddSet,
  onAddSet,
  onPressSet,
  onLongPressSet,
  onToggleCollapsed,
  onLongPressHeader,
}: Props) {
  const { name, muscleGroup, sets, collapsed } = exercise;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onToggleCollapsed}
        onLongPress={onLongPressHeader}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${sets.length} série${sets.length > 1 ? 's' : ''}`}
        accessibilityHint="Appui long pour retirer cet exercice"
        style={styles.header}
      >
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={typography.mono.meta}>{muscleGroupLabel(muscleGroup)}</Text>
        </View>

        <Text style={styles.count}>{sets.length}</Text>
      </Pressable>

      {collapsed ? (
        <Text style={styles.summary}>{summarizeExercise(exercise)}</Text>
      ) : (
        <>
          <View style={styles.columns}>
            <Text style={[typography.mono.meta, styles.columnIndex]}>N°</Text>
            <Text style={typography.mono.meta}>{countColumnLabel(exercise)}</Text>
            <Text style={[typography.mono.meta, styles.columnRight]}>
              {loadColumnLabel(exercise)}
            </Text>
          </View>

          {sets.map((set, index) => (
            <SetRow
              // L'index suffit comme clé : une série n'a pas d'identité propre,
              // et supprimer la n-ième renumérote bien tout ce qui suit.
              key={index}
              index={index + 1}
              set={set}
              onPress={() => onPressSet(index)}
              onLongPress={() => onLongPressSet(index)}
            />
          ))}

          <Pressable
            onPress={onAddSet}
            disabled={!canAddSet}
            accessibilityRole="button"
            accessibilityLabel="Ajouter une série"
            accessibilityState={{ disabled: !canAddSet }}
            style={styles.addSet}
          >
            <Text style={[styles.addSetLabel, !canAddSet && styles.addSetDisabled]}>
              + Ajouter une série
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

/** `RÉPÉTITIONS` ou `TEMPS`, selon la dernière série saisie. */
function countColumnLabel(exercise: SessionExercise): string {
  return lastOf(exercise)?.type === 'time' ? 'TEMPS' : 'RÉPÉTITIONS';
}

/** `CHARGE` ou `LEST`, selon que la dernière série est au poids du corps. */
function loadColumnLabel(exercise: SessionExercise): string {
  return lastOf(exercise)?.isBodyweight ? 'LEST' : 'CHARGE';
}

function lastOf(exercise: SessionExercise) {
  return exercise.sets.length === 0
    ? null
    : exercise.sets[exercise.sets.length - 1];
}

/** `avant_bras` → `AVANT-BRAS`. L'enum est en `snake_case`, l'écran non. */
function muscleGroupLabel(group: string): string {
  return group.replace(/_/g, '-').toUpperCase();
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface.raised,
    borderWidth: border.hairline,
    borderColor: colors.line.default,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: gap.row,
    paddingVertical: padding.dense.y,
    paddingHorizontal: padding.dense.x,
    borderBottomWidth: border.hairline,
    borderBottomColor: colors.line.default,
    // L'exercice appartient à la séance, donc à la progression : même en-tête
    // teinté d'or que `WorkoutCard`.
    backgroundColor: colors.workoutCard.headerBackground,
  },
  headerText: {
    flex: 1,
    gap: gap.line,
  },
  name: {
    ...typography.display.cardTitleCompact,
    color: colors.strength.exerciseName,
  },
  count: {
    ...typography.sans.metricInline,
    color: colors.text.secondary,
  },
  summary: {
    ...typography.sans.caption,
    paddingVertical: padding.dense.y,
    paddingHorizontal: padding.dense.x,
  },
  columns: {
    flexDirection: 'row',
    gap: gap.row,
    paddingVertical: padding.card.y / 2,
    paddingHorizontal: padding.dense.x,
    backgroundColor: colors.strength.columnBandBackground,
  },
  columnIndex: {
    width: setRow.indexColumn,
  },
  columnRight: {
    marginLeft: 'auto',
  },
  addSet: {
    justifyContent: 'center',
    height: touchTarget.minimum,
    paddingHorizontal: padding.dense.x,
    borderTopWidth: border.hairline,
    borderTopColor: colors.strength.setSeparator,
  },
  addSetLabel: {
    ...typography.sans.rowAction,
    color: colors.strength.rowAction,
  },
  addSetDisabled: {
    color: colors.text.label,
  },
});
