import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LogStackParamList } from '../../../navigation/types';

import { ErrorNotice } from '../../../components/Feedback';
import { Screen } from '../../../components/Screen';
import { TextField } from '../../../components/TextField';
import { Button, ReorderableList } from '../../../components/ui';
import {
  border,
  colors,
  padding,
  scrim,
  spacing,
  touchTarget,
  typography,
} from '../../../theme';
import { ExerciseCard } from '../components/ExerciseCard';
import { ExerciseListItem } from '../components/ExerciseListItem';
import { SessionStatsHeader } from '../components/SessionStatsHeader';
import { SetEditorSheet } from '../components/SetEditorSheet';
import { muscleGroupLabel } from '../muscleGroups';
import { computeSessionStats } from '../sessionStats';
import {
  MAX_EXERCISES,
  canAddExercise,
  canAddSet as canAddSetTo,
  emptyExerciseNames,
  lastSetOf,
} from '../sessionState';
import {
  DURATION_MAX_MIN,
  elapsedMinutes,
  formatDurationLabel,
  formatStopwatch,
  isImplausible,
  sessionDurationMin,
} from '../sessionDuration';
import { useStrengthSessionStore } from '../strengthSessionStore';
import { useNow } from '../useNow';
import { useSubmitSession } from '../useSubmitSession';
import type { SessionExercise, SetDraft } from '../types';

/**
 * Séance de musculation en cours — maquette 09, écrans ① et ②.
 *
 * ① n'est pas un écran mais l'état vide de celui-ci : une route séparée
 * permettrait d'y revenir par le retour arrière une fois la séance commencée.
 *
 * L'écran ne calcule rien lui-même. Il lit le store, appelle des fonctions
 * pures, et rend. Les seules décisions qui lui appartiennent sont celles de
 * l'interface : ce qui mérite une confirmation, et quand la feuille s'ouvre.
 *
 * **Les confirmations vivent ici et pas dans les composants.** Une carte qui
 * déciderait de ce qui mérite un `Alert` ne serait plus rendable ailleurs.
 */

/**
 * Ce que la suppression d'un exercice emporte.
 *
 * Trois cas plutôt qu'un « série(s) » abrégé : une carte sans aucune série est
 * non seulement possible mais *recommandée* à la suppression — c'est ce que dit
 * le message de validation quand un exercice est resté vide — et « ses 0 série »
 * comme « ses 1 série » ne se disent pas.
 */
function removalWarning(exercise: SessionExercise): string {
  const count = exercise.sets.length;

  if (count === 0) return `« ${exercise.name} » sera retiré de la séance.`;
  if (count === 1) return `« ${exercise.name} » sera retiré, avec sa série.`;

  return `« ${exercise.name} » sera retiré, avec ses ${count} séries.`;
}

/** Quelle série la feuille est en train d'éditer. */
type Editing = {
  exerciseKey: string;
  /** Nul pour une nouvelle série ; l'index de la série rouverte sinon. */
  index: number | null;
};

export function StrengthSessionScreen() {
  // Typé sur la pile : `reset` et les paramètres de l'écran de fin ne sont pas
  // vérifiables avec un `useNavigation` nu, et les `as never` du repo ailleurs
  // sont un pis-aller qu'on ne reproduit pas ici.
  const navigation = useNavigation<NativeStackNavigationProp<LogStackParamList>>();

  // Un sélecteur par action, comme partout ailleurs dans le dépôt : le store nu
  // abonne l'écran à tout l'état, y compris aux champs qu'il ne lit pas.
  const session = useStrengthSessionStore((s) => s.session);
  const addSet = useStrengthSessionStore((s) => s.addSet);
  const updateSet = useStrengthSessionStore((s) => s.updateSet);
  const removeSet = useStrengthSessionStore((s) => s.removeSet);
  const removeExercise = useStrengthSessionStore((s) => s.removeExercise);
  const moveExercise = useStrengthSessionStore((s) => s.moveExercise);
  const toggleCollapsed = useStrengthSessionStore((s) => s.toggleCollapsed);
  const setReordering = useStrengthSessionStore((s) => s.setReordering);
  const setDurationOverride = useStrengthSessionStore((s) => s.setDurationOverride);

  const now = useNow(1_000);
  const { submit, isSubmitting, error: submitError } = useSubmitSession();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [durationSheetOpen, setDurationSheetOpen] = useState(false);

  /**
   * Envoie la séance, puis remplace la pile par l'écran de fin.
   *
   * `reset` et non `navigate` : le retour arrière depuis l'écran de fin ne doit
   * pas ramener sur une séance déjà envoyée, qu'un second appui renverrait.
   */
  const send = async () => {
    const result = await submit();
    if (result === null) return;

    navigation.reset({
      index: 1,
      routes: [{ name: 'SportChoice' }, { name: 'StrengthSummary', params: { result } }],
    });
  };

  /**
   * Le garde-fou de `isImplausible`, armé au dernier moment utile.
   *
   * Une séance ouverte le matin et validée le soir part sinon avec la durée du
   * chrono, sans un mot. La confirmation porte la correction avec elle : sans
   * « Corriger », il faudrait annuler, retrouver le chrono de l'en-tête, puis
   * refaire le geste de validation.
   *
   * La durée est relue ici et non prise dans `now` : ce tic peut dater d'une
   * seconde, et le libellé doit annoncer exactement la valeur que
   * `toWorkoutPayload` enverra.
   */
  const finish = () => {
    const minutes = sessionDurationMin(session, Date.now());

    if (!isImplausible(minutes)) {
      void send();
      return;
    }

    Alert.alert(
      `Cette séance a duré ${formatDurationLabel(minutes)} ?`,
      'Le chrono tourne depuis l’ouverture de la séance. Corrige-la si tu as oublié de terminer la séance.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Corriger', onPress: () => setDurationSheetOpen(true) },
        { text: 'Envoyer quand même', onPress: () => void send() },
      ],
    );
  };

  const stats = useMemo(() => computeSessionStats(session.exercises), [session.exercises]);
  // La correction est déjà écrêtée dans le store : l'en-tête montre donc la
  // durée qui partira, dans la même écriture que l'écran de fin.
  const stopwatch = session.durationOverrideMin === null
    ? formatStopwatch(session.startedAt, now)
    : formatDurationLabel(session.durationOverrideMin);

  const editedExercise = session.exercises.find((e) => e.key === editing?.exerciseKey) ?? null;

  const confirmRemoveExercise = (exercise: SessionExercise) => {
    Alert.alert(
      'Retirer cet exercice ?',
      removalWarning(exercise),
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: () => removeExercise(exercise.key),
        },
      ],
    );
  };

  const confirmRemoveSet = (exercise: SessionExercise, index: number) => {
    Alert.alert(`Supprimer la série ${index + 1} ?`, undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => removeSet(exercise.key, index),
      },
    ]);
  };

  const validateSet = (set: SetDraft) => {
    if (editing === null) return;

    if (editing.index === null) addSet(editing.exerciseKey, set);
    else updateSet(editing.exerciseKey, editing.index, set);

    setEditing(null);
  };

  const manquants = emptyExerciseNames(session);
  const peutAjouterUnExercice = canAddExercise(session);

  return (
    <Screen
      onBack={() => navigation.goBack()}
      // Le défilement se coupe pendant le réordonnancement : le glisser de
      // `ReorderableList` tourne sur un `PanResponder` en thread JS, et un
      // `ScrollView` vertical au-dessus lui disputerait le geste à chaque
      // déplacement. Hors de ce mode, les cartes dépliées doivent défiler.
      scroll={!session.reordering}
      footer={
        <>
          {session.exercises.length > 0 ? (
            <Button
              label={session.reordering ? 'Terminer le réordonnancement' : 'Réordonner'}
              variant="tertiary"
              size="compact"
              onPress={() => setReordering(!session.reordering)}
            />
          ) : null}

          {submitError ? <ErrorNotice message={submitError} /> : null}

          <Button
            label={isSubmitting ? 'Enregistrement…' : 'Terminer la séance'}
            size="hero"
            disabled={
              session.exercises.length === 0 || manquants.length > 0 || isSubmitting
            }
            onPress={finish}
          />
        </>
      }
    >
      <SessionStatsHeader
        stats={stats}
        stopwatch={stopwatch}
        onPressStopwatch={() => setDurationSheetOpen(true)}
      />

      {session.exercises.length === 0 ? (
        <View style={styles.empty}>
          <Text style={typography.display.cardTitle}>
            Le premier exercice ouvre la séance
          </Text>
          <Text style={typography.sans.bodySmall}>
            Cherche dans le catalogue : les exercices de l’app, plus les tiens.
          </Text>
        </View>
      ) : session.reordering ? (
        <ReorderableList
          data={session.exercises}
          keyOf={(exercise) => exercise.key}
          rowHeight={touchTarget.row}
          onMove={moveExercise}
          renderItem={(exercise, index, handle) => (
            <ExerciseListItem
              name={exercise.name}
              subtitle={`${index + 1} · ${muscleGroupLabel(exercise.muscleGroup)}`}
              handle={handle}
            />
          )}
        />
      ) : (
        <View style={styles.cards}>
          {session.exercises.map((exercise) => (
            <ExerciseCard
              key={exercise.key}
              exercise={exercise}
              canAddSet={canAddSetTo(session, exercise.key)}
              onAddSet={() => setEditing({ exerciseKey: exercise.key, index: null })}
              onPressSet={(index) => setEditing({ exerciseKey: exercise.key, index })}
              onLongPressSet={(index) => confirmRemoveSet(exercise, index)}
              onToggleCollapsed={() => toggleCollapsed(exercise.key)}
              onLongPressHeader={() => confirmRemoveExercise(exercise)}
            />
          ))}
        </View>
      )}

      {session.reordering ? null : (
        <Pressable
          onPress={() => navigation.navigate('ExerciseCatalog')}
          // Éteint au plafond plutôt que muet : ouvrir le catalogue laisserait
          // choisir un exercice, refermerait l'écran, et n'ajouterait rien —
          // `addExercise` rend l'état inchangé passé `MAX_EXERCISES`.
          disabled={!peutAjouterUnExercice}
          accessibilityRole="button"
          accessibilityLabel={
            peutAjouterUnExercice
              ? 'Ajouter un exercice'
              : `Séance complète : ${MAX_EXERCISES} exercices au maximum`
          }
          accessibilityState={{ disabled: !peutAjouterUnExercice }}
          style={styles.addExercise}
        >
          <Text
            style={[
              typography.sans.bodySmall,
              peutAjouterUnExercice ? null : styles.addExerciseDisabled,
            ]}
          >
            {peutAjouterUnExercice
              ? '+ Ajouter un exercice'
              : `Séance complète : ${MAX_EXERCISES} exercices au maximum`}
          </Text>
        </Pressable>
      )}

      {manquants.length > 0 ? (
        <Text style={typography.sans.caption}>
          {manquants.join(', ')} : aucune série. Ajoute-en une, ou retire
          l’exercice par un appui long sur son nom.
        </Text>
      ) : null}

      <SetEditorSheet
        visible={editing !== null}
        exerciseName={editedExercise?.name ?? ''}
        setNumber={(editing?.index ?? editedExercise?.sets.length ?? 0) + 1}
        initial={
          // Nul pour une nouvelle série ; la série rouverte sinon. Cette valeur
          // est la référence exacte détenue par le store — `session.exercises`
          // n'est jamais reconstruit par le tic du chrono, qui vit dans l'état
          // local de `useNow` et ne touche jamais le store. `.find()` rend donc
          // le même objet tant qu'aucune action n'a modifié la séance, ce qui
          // maintient la feuille ouverte sans effacer la saisie en cours.
          editing === null || editing.index === null || editedExercise === null
            ? null
            : (editedExercise.sets[editing.index] ?? null)
        }
        // « Reprendre la précédente » : c'est `lastSetOf` qui sait la trouver,
        // et refaire le calcul ici en ferait un second endroit à corriger.
        previous={editing === null ? null : lastSetOf(session, editing.exerciseKey)}
        onCancel={() => setEditing(null)}
        onValidate={validateSet}
      />

      <DurationSheet
        visible={durationSheetOpen}
        // La même fonction que l'envoi, et pas un calcul refait ici : avec un
        // `Math.round`, la feuille proposait 51 là où le corps aurait porté 52.
        defaultMinutes={elapsedMinutes(session.startedAt, now)}
        onCancel={() => setDurationSheetOpen(false)}
        onValidate={(minutes) => {
          setDurationOverride(minutes);
          setDurationSheetOpen(false);
        }}
      />
    </Screen>
  );
}

/**
 * Correction manuelle de la durée — maquette 09, écran ②.
 *
 * `Alert.prompt` est iOS seulement et vaut `undefined` sur Android : l'utiliser
 * priverait Android du seul garde-fou contre l'oubli de validation, ce qui
 * n'est pas acceptable. Une petite feuille locale à l'écran, sur le modèle de
 * `CreateExerciseSheet` : réutiliser `SetEditorSheet` pour un champ unique
 * aurait été un abus de ses raccourcis de série.
 *
 * **Le piège de `SetEditorSheet` se rejoue ici** : l'écran qui l'ouvre se
 * redessine chaque seconde à cause du chrono, donc `defaultMinutes` change de
 * valeur à chaque rendu tant que la feuille reste ouverte. L'effet de reset ne
 * dépend que de `visible`, jamais de `defaultMinutes` : il ne relit cette
 * valeur qu'au moment précis où la feuille s'ouvre, avec la donnée la plus
 * fraîche de ce rendu-là, et ignore ensuite tous les tics suivants — sinon la
 * correction tapée serait effacée chaque seconde.
 */
type DurationSheetProps = {
  visible: boolean;
  defaultMinutes: number;
  onCancel: () => void;
  onValidate: (minutes: number) => void;
};

function DurationSheet({ visible, defaultMinutes, onCancel, onValidate }: DurationSheetProps) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!visible) return;

    setValue(String(defaultMinutes));
    // Volontairement partiel : voir le commentaire au-dessus du composant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const minutes = Number.parseInt(value, 10);
  // Bornée au maximum du DTO : valider 9 999 laisserait croire à une séance de
  // sept jours pour un corps qui en porterait un.
  const canValidate =
    Number.isInteger(minutes) && minutes > 0 && minutes <= DURATION_MAX_MIN;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissArea} onPress={onCancel} accessible={false} />

        <View style={styles.durationSheet}>
          <View style={styles.durationHead}>
            <Text style={typography.mono.meta}>DURÉE DE LA SÉANCE</Text>
            <Pressable onPress={onCancel} accessibilityRole="button">
              <Text style={typography.mono.meta}>ANNULER</Text>
            </Pressable>
          </View>

          <TextField
            label="Durée"
            unit="min"
            value={value}
            onChangeText={setValue}
            keyboardType="number-pad"
            returnKeyType="done"
            autoFocus
          />

          <Button
            label="Valider"
            size="hero"
            disabled={!canValidate}
            onPress={() => {
              if (canValidate) onValidate(minutes);
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  empty: {
    gap: spacing.row,
  },
  cards: {
    gap: spacing.list,
  },
  addExercise: {
    alignItems: 'center',
    justifyContent: 'center',
    height: touchTarget.row,
    borderWidth: border.hairline,
    borderColor: colors.line.control,
    borderStyle: 'dashed',
  },
  addExerciseDisabled: {
    color: colors.text.label,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: scrim.plain,
  },
  dismissArea: {
    flex: 1,
  },
  durationSheet: {
    gap: spacing.block,
    paddingTop: padding.modalBody.y,
    paddingHorizontal: padding.modalBody.x,
    paddingBottom: spacing.notch,
    backgroundColor: colors.surface.page,
    borderTopWidth: border.hairline,
    borderTopColor: colors.line.controlOnModal,
  },
  durationHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget.minimum,
  },
});
