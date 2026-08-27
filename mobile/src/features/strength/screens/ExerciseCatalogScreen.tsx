import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { ErrorNotice, LoadingState } from '../../../components/Feedback';
import { Screen } from '../../../components/Screen';
import { TextField } from '../../../components/TextField';
import { Button } from '../../../components/ui';
import { spacing, typography } from '../../../theme';
import type { LogStackParamList } from '../../../navigation/types';
import { useAppendToWorkout } from '../../programs/useAppendToWorkout';
import { CreateExerciseSheet } from '../components/CreateExerciseSheet';
import { ExerciseListItem } from '../components/ExerciseListItem';
import { MuscleGroupFilter } from '../components/MuscleGroupFilter';
import { muscleGroupLabel } from '../muscleGroups';
import { useStrengthSessionStore } from '../strengthSessionStore';
import type { MuscleGroup } from '../types';
import { useExerciseCatalog, type Exercise } from '../useExerciseCatalog';

/**
 * Catalogue d'exercices — maquette 09, écran ④.
 *
 * Présenté en modale, il ne renvoie rien : il écrit l'exercice choisi à sa
 * destination et referme. C'est ce qui évite de faire voyager un résultat en
 * route params.
 *
 * **Deux destinations, une seule liste.** Sans paramètre, l'exercice rejoint la
 * séance en cours par le store. Avec `addTo`, il rejoint un jour type par
 * l'API — le catalogue est le même, et le dupliquer pour changer d'écriture
 * ferait diverger la recherche, les filtres et la création d'exercice perso.
 *
 * Le lien entre les deux gestes du bas de l'écran : la recherche restée sans
 * résultat pré-remplit le nom du nouvel exercice. Ne pas le faire obligerait à
 * retaper ce qu'on vient de chercher.
 */
export function ExerciseCatalogScreen() {
  const navigation = useNavigation();
  const params = useRoute<RouteProp<LogStackParamList, 'ExerciseCatalog'>>().params;
  const workoutId = params?.addTo.workoutId ?? null;

  const addExercise = useStrengthSessionStore((s) => s.addExercise);
  const { append, error: appendError, isBusy } = useAppendToWorkout(workoutId);

  const {
    exercises,
    isLoading,
    error,
    reload,
    search,
    setSearch,
    muscleGroup,
    setMuscleGroup,
    create,
    isCreating,
    createError,
    clearCreateError,
  } = useExerciseCatalog();

  const [creating, setCreating] = useState(false);

  const choose = async (exercise: Exercise) => {
    if (workoutId !== null) {
      // Un second appui pendant l'écriture ajouterait deux fois le même
      // exercice : la liste envoyée est construite avant la réponse.
      if (isBusy) return;

      // L'écriture peut échouer — jour supprimé, jour complet, réseau. Le
      // catalogue reste alors ouvert avec son message, au lieu de refermer sur
      // un ajout qui n'a pas eu lieu.
      if (await append(exercise.id)) navigation.goBack();
      return;
    }

    addExercise({
      exerciseId: exercise.id,
      name: exercise.name,
      muscleGroup: exercise.muscle_group,
    });
    navigation.goBack();
  };

  const createAndChoose = async (name: string, group: MuscleGroup) => {
    const created = await create(name, group);
    // `null` : le message est déjà dans `createError` et la feuille reste
    // ouverte avec la saisie. Refermer ferait perdre les deux.
    if (created === null) return;

    setCreating(false);
    await choose(created);
  };

  return (
    <Screen
      eyebrow={workoutId === null ? 'CATALOGUE' : 'JOUR TYPE'}
      title="Ajouter un exercice"
      onBack={() => navigation.goBack()}
      scroll={false}
      footer={
        <Button
          label="Créer un exercice"
          variant="secondary"
          onPress={() => {
            clearCreateError();
            setCreating(true);
          }}
        />
      }
    >
      <View style={styles.controls}>
        <TextField
          label="Chercher"
          value={search}
          onChangeText={setSearch}
          placeholder="Développé couché"
          autoCorrect={false}
          returnKeyType="search"
        />
        <MuscleGroupFilter value={muscleGroup} onChange={setMuscleGroup} />
      </View>

      {error ? <ErrorNotice message={error} onRetry={reload} /> : null}

      {appendError ? <ErrorNotice message={appendError} /> : null}

      {exercises === null && isLoading ? <LoadingState /> : null}

      {exercises !== null ? (
        <FlatList
          data={exercises}
          keyExtractor={(exercise) => exercise.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={typography.sans.bodySmall}>
              Aucun exercice ne correspond. Crée-le : il sera à toi, et il
              rejoindra tes séances suivantes.
            </Text>
          }
          renderItem={({ item }) => (
            <ExerciseListItem
              name={item.name}
              subtitle={muscleGroupLabel(item.muscle_group)}
              owned={item.created_by !== null}
              onPress={() => void choose(item)}
            />
          )}
        />
      ) : null}

      <CreateExerciseSheet
        visible={creating}
        initialName={search}
        isCreating={isCreating}
        error={createError}
        onCancel={() => setCreating(false)}
        onCreate={(name, group) => void createAndChoose(name, group)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: {
    gap: spacing.row,
    // `MuscleGroupFilter` porte sa propre marge latérale pour défiler bord à
    // bord ; `Screen` en pose déjà une. La neutraliser ici évite un double
    // retrait de la rangée de puces.
    marginHorizontal: -spacing.screen,
    paddingHorizontal: spacing.screen,
  },
});
