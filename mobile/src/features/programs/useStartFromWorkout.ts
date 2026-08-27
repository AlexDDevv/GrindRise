import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';

import type { LogStackParamList } from '../../navigation/types';
import { useStrengthSessionStore } from '../strength/strengthSessionStore';
import { exercisesOf } from './programState';
import type { Program, ProgramWorkout } from './types';

/**
 * Démarre une séance sur un jour type, en protégeant celle qui serait perdue.
 *
 * **Une séance à la fois.** Le store n'en porte qu'une, et partir sur un jour
 * type écrase ce qui s'y trouve. Tant qu'elle est vide il n'y a rien à
 * demander ; dès qu'elle porte un exercice, la remplacer sans prévenir
 * détruirait un travail que personne ne peut retrouver — c'est le seul endroit
 * du parcours où un appui coûte cher.
 *
 * Le design laissait ouvert « remplacer après confirmation, ou refuser ».
 * Refuser obligerait à aller terminer ou vider la séance ailleurs avant de
 * pouvoir démarrer, sans dire où : la confirmation dit ce qui se perd et laisse
 * le choix sur place.
 *
 * La confirmation remonte en props plutôt qu'en composant : deux écrans
 * démarrent un jour type, et chacun la rend là où ses autres modales vivent.
 */
export function useStartFromWorkout() {
  const navigation = useNavigation<NativeStackNavigationProp<LogStackParamList>>();
  const startFrom = useStrengthSessionStore((s) => s.startFrom);
  const current = useStrengthSessionStore((s) => s.session);

  const [pending, setPending] = useState<{
    program: Program;
    workout: ProgramWorkout;
  } | null>(null);

  const launch = useCallback(
    (program: Program, workout: ProgramWorkout) => {
      startFrom(
        {
          programWorkoutId: workout.id,
          programName: program.name,
          workoutName: workout.name,
        },
        exercisesOf(workout),
      );

      navigation.navigate('StrengthSession');
    },
    [navigation, startFrom],
  );

  const start = useCallback(
    (program: Program, workout: ProgramWorkout) => {
      // Une séance sans exercice n'a rien à perdre : la remplacer est invisible,
      // et demander confirmation pour rien apprend à valider sans lire.
      if (current.exercises.length === 0) {
        launch(program, workout);
        return;
      }

      setPending({ program, workout });
    },
    [current.exercises.length, launch],
  );

  const confirmation = {
    visible: pending !== null,
    eyebrow: 'SÉANCE EN COURS',
    title: `Démarrer ${pending?.workout.name ?? ''} ?`,
    warning: warningFor(current.exercises.length),
    confirmLabel: 'Remplacer la séance',
    dismissLabel: 'GARDER LA SÉANCE',
    onConfirm: () => {
      if (!pending) return;

      const { program, workout } = pending;
      setPending(null);
      launch(program, workout);
    },
    onDismiss: () => setPending(null),
  };

  return { start, confirmation };
}

function warningFor(count: number): string {
  const exercices =
    count === 1 ? 'Son exercice' : `Ses ${count} exercices`;

  return `Une séance est déjà ouverte. ${exercices} et leurs séries seront perdus — une séance ne s'enregistre qu'une fois terminée.`;
}
