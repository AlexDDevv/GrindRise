import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MenuDots } from '../../../components/ui';
import {
  border,
  colors,
  gap,
  padding,
  programCard,
  touchTarget,
  typography,
} from '../../../theme';
import { exerciseCountLabel, workoutCountLabel, workoutsOf } from '../programState';
import type { Program, ProgramWorkout } from '../types';

/**
 * Un programme et ses jours types — maquette 10, écran ⑥′.
 *
 * « Trois niveaux, une seule carte » : le programme en en-tête teinté d'or, ses
 * jours en lignes de 56 points, l'ajout en pied. C'est la forme d'`ExerciseCard`
 * et elle est reprise sciemment — un programme est à ses jours ce qu'un exercice
 * est à ses séries, et deux mises en page pour un même rapport se liraient comme
 * deux idées différentes.
 *
 * **Le départ est dans la ligne, pas dans le pied.** La maquette 09 posait un
 * bouton d'or unique en bas ; il figeait un jour arbitraire. Chaque jour porte
 * désormais le sien, à droite, sur toute la hauteur de sa ligne — et le corps
 * de la ligne ouvre le jour. Deux cibles franches plutôt qu'un choix implicite.
 *
 * La carte ne connaît ni le réseau ni les confirmations : elle remonte des
 * intentions, l'écran décide de ce qu'elles ouvrent.
 */

type Props = {
  program: Program;
  /** Jour type le plus récemment suivi, quel que soit son programme. */
  lastWorkoutId: string | null;
  /** Ouvre le jour type : son ordre d'exercices. */
  onOpenWorkout: (workout: ProgramWorkout) => void;
  /** Démarre une séance sur ce jour. */
  onStartWorkout: (workout: ProgramWorkout) => void;
  onAddWorkout: () => void;
  onOpenMenu: () => void;
};

export function ProgramCard({
  program,
  lastWorkoutId,
  onOpenWorkout,
  onStartWorkout,
  onAddWorkout,
  onOpenMenu,
}: Props) {
  const workouts = workoutsOf(program);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>
          {program.name}
        </Text>

        <Text style={typography.mono.meta}>{workoutCountLabel(program)}</Text>

        <MenuDots onPress={onOpenMenu} accessibilityLabel={`Actions sur ${program.name}`} />
      </View>

      {workouts.map((workout) => (
        <View key={workout.id} style={styles.row}>
          <Pressable
            onPress={() => onOpenWorkout(workout)}
            accessibilityRole="button"
            accessibilityLabel={`${workout.name}, ${exerciseCountLabel(workout).toLowerCase()}`}
            accessibilityHint="Ouvre l’ordre des exercices"
            style={({ pressed }) => [styles.rowBody, pressed && styles.rowPressed]}
          >
            <Text style={styles.workoutName} numberOfLines={1}>
              {workout.name}
            </Text>
            <Text style={typography.mono.meta} numberOfLines={1}>
              {exerciseCountLabel(workout)}
              {workout.id === lastWorkoutId ? ' · DERNIER FAIT' : ''}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => onStartWorkout(workout)}
            accessibilityRole="button"
            accessibilityLabel={`Démarrer ${workout.name}`}
            style={({ pressed }) => [styles.start, pressed && styles.startPressed]}
          >
            <Text style={styles.startLabel}>DÉMARRER</Text>
          </Pressable>
        </View>
      ))}

      <Pressable
        onPress={onAddWorkout}
        accessibilityRole="button"
        accessibilityLabel={`Ajouter un jour type à ${program.name}`}
        style={({ pressed }) => [styles.addRow, pressed && styles.rowPressed]}
      >
        <Text style={styles.addLabel}>+ Ajouter un jour type</Text>
      </Pressable>
    </View>
  );
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
    // Un programme prépare des séances, donc de la progression : même en-tête
    // teinté d'or que `WorkoutCard` et `ExerciseCard`.
    backgroundColor: colors.workoutCard.headerBackground,
  },
  name: {
    ...typography.display.cardTitleCompact,
    flex: 1,
    color: colors.strength.exerciseName,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: touchTarget.row,
    borderTopWidth: border.hairline,
    borderTopColor: colors.strength.setSeparator,
  },
  rowBody: {
    flex: 1,
    justifyContent: 'center',
    gap: gap.line,
    paddingHorizontal: padding.dense.x,
  },
  rowPressed: {
    backgroundColor: colors.workoutCard.headerBackground,
  },
  workoutName: {
    ...typography.sans.rowAction,
    color: colors.text.titleSoft,
  },
  start: {
    width: programCard.startColumn,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: border.hairline,
    borderLeftColor: colors.strength.setSeparator,
    // Voile d'or et non aplat : le §02 réserve l'aplat à l'action principale
    // d'un écran, et une liste de six départs dorés n'en désignerait aucun.
    backgroundColor: colors.control.activeBackground,
  },
  startPressed: {
    backgroundColor: colors.strength.activeRowBackground,
  },
  startLabel: {
    ...typography.mono.meta,
    color: colors.text.progress,
  },
  addRow: {
    justifyContent: 'center',
    height: programCard.actionRow,
    paddingHorizontal: padding.dense.x,
    borderTopWidth: border.hairline,
    borderTopColor: colors.strength.setSeparator,
  },
  addLabel: {
    ...typography.sans.rowAction,
    color: colors.strength.rowAction,
  },
});
