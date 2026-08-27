import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ErrorNotice, LoadingState } from '../../../components/Feedback';
import { Screen } from '../../../components/Screen';
import type { EdgeScroller } from '../../../components/ui';
import {
  Button,
  ConfirmDialog,
  MenuDots,
  MenuSheet,
  ReorderableList,
} from '../../../components/ui';
import { spacing, touchTarget, typography } from '../../../theme';
import type { LogStackParamList } from '../../../navigation/types';
import { ExerciseListItem } from '../../strength/components/ExerciseListItem';
import { muscleGroupLabel } from '../../strength/muscleGroups';
import { NameSheet } from '../components/NameSheet';
import { locate, orderedEntries, toInput } from '../programState';
import { MAX_EXERCISES_PER_WORKOUT } from '../types';
import { usePrograms } from '../usePrograms';
import { useStartFromWorkout } from '../useStartFromWorkout';

/**
 * Ordre des exercices d'un jour type — maquette 10, écran ⑦′.
 *
 * **Rien à valider.** L'ordre s'enregistre au glisser : « TERMINÉ » a quitté
 * l'en-tête, et le pied porte enfin ce à quoi l'écran sert — partir. Chaque
 * relâchement envoie la liste entière, ce que le serveur attend de toute façon,
 * et l'affichage n'attend pas la réponse : voir `reorderExercises`.
 *
 * **Un jour type ne porte que l'ordre.** Ni séries ni répétitions cibles —
 * c'est la contrainte du modèle, et le sous-titre de l'écran la dit plutôt que
 * de la laisser deviner.
 *
 * La suppression a quitté le pied pour le menu : une action irréversible
 * n'occupe pas la place du geste principal.
 */

export function ProgramWorkoutScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LogStackParamList>>();
  const { workoutId } = useRoute<RouteProp<LogStackParamList, 'ProgramWorkout'>>().params;

  const {
    programs,
    error,
    reload,
    isBusy,
    writeError,
    clearWriteError,
    renameWorkout,
    deleteWorkout,
    replaceExercises,
    reorderExercises,
  } = usePrograms();

  const { start: startWorkout, confirmation } = useStartFromWorkout();

  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [grabbed, setGrabbed] = useState(false);
  const scroller = useRef<EdgeScroller>(null);

  const found = programs ? locate(programs, workoutId) : null;

  // Le jour a disparu — supprimé depuis un autre écran, ou par la confirmation
  // de cet écran-ci, qui recharge avant que la navigation ne revienne.
  if (programs !== null && found === null) {
    return (
      <Screen
        eyebrow="JOUR TYPE"
        title="Ce jour type n'existe plus"
        onBack={() => navigation.goBack()}
        intro="Il a été supprimé. Reviens à tes programmes pour en choisir un autre."
      />
    );
  }

  // Les lignes et non les exercices : leur identifiant propre sert de clé de
  // liste, et il ne bouge pas quand l'ordre change.
  const rows = found ? orderedEntries(found.workout) : [];
  const canAdd = rows.length < MAX_EXERCISES_PER_WORKOUT;

  /** L'ordre visé, envoyé tel quel : le serveur réattribue les rangs. */
  const move = (from: number, to: number) => {
    if (!found || !programs) return;

    const next = rows.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    // L'arbre est reconstruit pour que l'affichage suive sans attendre le
    // serveur. Seuls les rangs changent, donc rien d'autre n'est touché.
    const optimistic = programs.map((program) =>
      program.id !== found.program.id
        ? program
        : {
            ...program,
            program_workouts: (program.program_workouts ?? []).map((workout) =>
              workout.id !== workoutId
                ? workout
                : {
                    ...workout,
                    // Les lignes elles-mêmes, renumérotées : leurs
                    // identifiants survivent au déplacement, donc les clés de
                    // liste aussi.
                    program_workout_exercises: next.map((entry, index) => ({
                      ...entry,
                      order_index: index,
                    })),
                  },
            ),
          },
    );

    void reorderExercises(
      workoutId,
      next.map((entry) => entry.exercise_id),
      optimistic,
    );
  };

  return (
    <Screen
      eyebrow={found?.program.name.toUpperCase() ?? 'JOUR TYPE'}
      title={found?.workout.name ?? ''}
      intro="Glisse pour changer l'ordre. Les séries se saisissent pendant la séance."
      onBack={() => navigation.goBack()}
      scrollEnabled={!grabbed}
      scrollerRef={scroller}
      footer={
        found ? (
          <>
            {writeError ? <ErrorNotice message={writeError} /> : null}

            <Button
              label="Démarrer ce jour"
              size="hero"
              disabled={isBusy}
              onPress={() => startWorkout(found.program, found.workout)}
            />
          </>
        ) : null
      }
    >
      {error ? <ErrorNotice message={error} onRetry={() => void reload()} /> : null}

      {programs === null && !error ? <LoadingState /> : null}

      {found ? (
        <>
          <View style={styles.head}>
            <MenuDots
              horizontal
              onPress={() => setMenuOpen(true)}
              accessibilityLabel={`Actions sur ${found.workout.name}`}
            />
          </View>

          {rows.length === 0 ? (
            <Text style={typography.sans.bodySmall}>
              Ce jour type est vide. Ajoute les exercices dans l'ordre où tu veux
              les enchaîner.
            </Text>
          ) : (
            <ReorderableList
              data={rows}
              // L'identifiant de la ligne, et non celui de l'exercice : le même
              // mouvement peut légitimement figurer deux fois dans un jour.
              keyOf={(entry) => entry.id}
              rowHeight={touchTarget.row}
              onMove={move}
              onGrabChange={setGrabbed}
              scroller={scroller}
              renderItem={(entry, index, handle) => {
                const exercise = toInput(entry);

                return (
                  <ExerciseListItem
                    name={exercise.name}
                    subtitle={`${index + 1} · ${muscleGroupLabel(exercise.muscleGroup)}`}
                    handle={handle}
                  />
                );
              }}
            />
          )}

          <Button
            label={
              canAdd
                ? '+ Ajouter un exercice'
                : `Jour complet : ${MAX_EXERCISES_PER_WORKOUT} exercices au maximum`
            }
            variant="secondary"
            disabled={!canAdd || isBusy}
            onPress={() => navigation.navigate('ExerciseCatalog', { addTo: { workoutId } })}
          />
        </>
      ) : null}

      <MenuSheet
        visible={menuOpen}
        title={found?.workout.name ?? ''}
        actions={[
          { label: 'Renommer le jour type', onPress: () => setRenaming(true) },
          {
            label: 'Vider les exercices',
            onPress: () => {
              // Une liste vide est un remplacement valide côté serveur : c'est
              // ainsi qu'on vide un jour, sans endpoint dédié.
              void replaceExercises(workoutId, []);
            },
          },
          {
            label: 'Supprimer ce jour type',
            danger: true,
            onPress: () => setDeleting(true),
          },
        ]}
        onClose={() => setMenuOpen(false)}
      />

      <NameSheet
        visible={renaming}
        eyebrow="Renommer"
        fieldLabel="Nom du jour"
        initialName={found?.workout.name ?? ''}
        submitLabel="Enregistrer"
        isBusy={isBusy}
        error={writeError}
        onCancel={() => {
          setRenaming(false);
          clearWriteError();
        }}
        onSubmit={(name) => {
          void renameWorkout(workoutId, name).then((done) => {
            if (done) setRenaming(false);
          });
        }}
      />

      <ConfirmDialog
        visible={deleting}
        eyebrow="SUPPRESSION"
        title={`Supprimer ${found?.workout.name ?? ''} ?`}
        warning="Son ordre d'exercices part avec lui. Les séances déjà enregistrées restent dans ton historique."
        confirmLabel="Supprimer"
        dismissLabel="GARDER"
        isBusy={isBusy}
        onConfirm={() => {
          void deleteWorkout(workoutId).then((done) => {
            setDeleting(false);
            if (done) navigation.goBack();
          });
        }}
        onDismiss={() => setDeleting(false)}
      />

      <ConfirmDialog {...confirmation} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    // Remonté contre l'introduction : les trois points appartiennent à
    // l'en-tête de l'écran, pas au contenu qui suit.
    marginTop: -spacing.row,
  },
});
