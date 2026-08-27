import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ErrorNotice, LoadingState } from '../../../components/Feedback';
import { Screen } from '../../../components/Screen';
import { Button, ConfirmDialog, MenuSheet } from '../../../components/ui';
import { gap, spacing, typography } from '../../../theme';
import type { LogStackParamList } from '../../../navigation/types';
import { ProgramCard } from '../components/ProgramCard';
import { NameSheet } from '../components/NameSheet';
import { deletionWarning } from '../programState';
import type { Program } from '../types';
import { useLastProgramWorkout } from '../useLastProgramWorkout';
import { usePrograms } from '../usePrograms';
import { useStartFromWorkout } from '../useStartFromWorkout';

/**
 * Mes programmes — maquette 10, écrans ⑥′ et ⑥∅.
 *
 * Trois états pour un écran : la liste, le vide, et l'échec de lecture. Le vide
 * n'est pas une liste sans lignes — il explique le modèle en une phrase, parce
 * que c'est le seul moment où l'utilisateur ne l'a pas encore vu, et il fait de
 * la création l'action d'or puisqu'elle est la seule possible.
 *
 * **Le pied ne porte pas de départ.** La maquette 09 y posait « Démarrer Jour
 * Push » : il figeait un jour arbitraire. Chaque jour porte le sien dans sa
 * ligne, et le pied garde la création, en secondaire — sur cet écran on part
 * s'entraîner plus souvent qu'on ne fabrique.
 *
 * Les enchaînements viennent du design : créer un programme ouvre l'ajout de
 * son premier jour, ajouter un jour ouvre son catalogue. Un programme vide ou
 * un jour vide sont des culs-de-sac, et les traverser d'un geste est ce qui
 * distingue un parcours d'une suite de formulaires.
 */

/** Noms tout prêts : personne n'invente « Push Pull Legs » au premier essai. */
const PROGRAM_SUGGESTIONS = ['Push Pull Legs', 'Haut / Bas', 'Full body'] as const;
const WORKOUT_SUGGESTIONS = ['Jour Push', 'Jour Pull', 'Jour Legs'] as const;

type Sheet =
  | { kind: 'createProgram' }
  | { kind: 'addWorkout'; program: Program }
  | { kind: 'renameProgram'; program: Program };

export function ProgramsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LogStackParamList>>();

  const {
    programs,
    error,
    reload,
    isBusy,
    writeError,
    clearWriteError,
    createProgram,
    renameProgram,
    deleteProgram,
    addWorkout,
  } = usePrograms();

  const lastWorkoutId = useLastProgramWorkout();
  const { start: startWorkout, confirmation } = useStartFromWorkout();

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [menuFor, setMenuFor] = useState<Program | null>(null);
  const [deleting, setDeleting] = useState<Program | null>(null);

  const closeSheet = () => {
    setSheet(null);
    clearWriteError();
  };

  const isEmpty = programs !== null && programs.length === 0;

  return (
    <Screen
      eyebrow="MUSCULATION"
      title="Mes programmes"
      onBack={() => navigation.goBack()}
      footer={
        programs === null ? null : (
          <>
            {writeError ? <ErrorNotice message={writeError} /> : null}

            <Button
              label={isEmpty ? 'Créer mon premier programme' : 'Créer un programme'}
              // Sur le vide, la création est la seule action possible : elle
              // prend l'or. Dès qu'il y a des programmes, l'action de l'écran
              // devient de partir s'entraîner, et la création passe en retrait.
              variant={isEmpty ? 'primary' : 'secondary'}
              size={isEmpty ? 'hero' : 'full'}
              disabled={isBusy}
              onPress={() => setSheet({ kind: 'createProgram' })}
            />
          </>
        )
      }
    >
      {error ? <ErrorNotice message={error} onRetry={() => void reload()} /> : null}

      {programs === null && !error ? <LoadingState /> : null}

      {isEmpty ? (
        <View style={styles.empty}>
          <Text style={typography.display.cardTitle}>
            Un programme, c'est un ordre d'exercices que tu réutilises
          </Text>
          <Text style={typography.sans.bodySmall}>
            Tu nommes le programme, tu ajoutes des jours types, tu ranges les
            exercices dans l'ordre. Les séries se saisissent pendant la séance.
          </Text>
          <Text style={typography.sans.caption}>
            La séance libre reste disponible, à l'écran précédent.
          </Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {(programs ?? []).map((program) => (
          <ProgramCard
            key={program.id}
            program={program}
            lastWorkoutId={lastWorkoutId}
            onOpenWorkout={(workout) =>
              navigation.navigate('ProgramWorkout', { workoutId: workout.id })
            }
            onStartWorkout={(workout) => startWorkout(program, workout)}
            onAddWorkout={() => setSheet({ kind: 'addWorkout', program })}
            onOpenMenu={() => setMenuFor(program)}
          />
        ))}
      </View>

      <MenuSheet
        visible={menuFor !== null}
        title={menuFor?.name ?? ''}
        actions={[
          {
            label: 'Renommer le programme',
            onPress: () => {
              if (menuFor) setSheet({ kind: 'renameProgram', program: menuFor });
            },
          },
          {
            label: 'Ajouter un jour type',
            onPress: () => {
              if (menuFor) setSheet({ kind: 'addWorkout', program: menuFor });
            },
          },
          {
            label: 'Supprimer le programme',
            danger: true,
            onPress: () => setDeleting(menuFor),
          },
        ]}
        onClose={() => setMenuFor(null)}
      />

      <NameSheet
        visible={sheet?.kind === 'createProgram'}
        eyebrow="Nouveau programme"
        fieldLabel="Nom"
        suggestions={PROGRAM_SUGGESTIONS}
        hint="Le programme est créé vide. Tu ajoutes ses jours types juste après."
        submitLabel="Créer le programme"
        isBusy={isBusy}
        error={writeError}
        onCancel={closeSheet}
        onSubmit={(name) => {
          void createProgram(name).then((created) => {
            // Enchaîné plutôt que refermé sur une carte vide : un programme
            // sans jour type ne sert à rien, et c'est le moment où l'on sait
            // quel jour on veut.
            if (created) setSheet({ kind: 'addWorkout', program: created });
          });
        }}
      />

      <NameSheet
        visible={sheet?.kind === 'addWorkout'}
        eyebrow={
          sheet?.kind === 'addWorkout'
            ? `${sheet.program.name} · nouveau jour`
            : 'Nouveau jour type'
        }
        fieldLabel="Nom du jour"
        suggestions={WORKOUT_SUGGESTIONS}
        hint="Le jour type ne porte que l'ordre des exercices. Ni séries ni répétitions cibles."
        submitLabel="Ajouter le jour type"
        isBusy={isBusy}
        error={writeError}
        onCancel={closeSheet}
        onSubmit={(name) => {
          if (sheet?.kind !== 'addWorkout') return;

          void addWorkout(sheet.program.id, name).then((created) => {
            if (!created) return;

            closeSheet();
            // Droit sur son ordre d'exercices : un jour vide n'a rien à
            // montrer, et le remplir est la suite évidente.
            navigation.navigate('ProgramWorkout', { workoutId: created.id });
          });
        }}
      />

      <NameSheet
        visible={sheet?.kind === 'renameProgram'}
        eyebrow="Renommer"
        fieldLabel="Nom"
        initialName={sheet?.kind === 'renameProgram' ? sheet.program.name : ''}
        submitLabel="Enregistrer"
        isBusy={isBusy}
        error={writeError}
        onCancel={closeSheet}
        onSubmit={(name) => {
          if (sheet?.kind !== 'renameProgram') return;

          void renameProgram(sheet.program.id, name).then((done) => {
            if (done) closeSheet();
          });
        }}
      />

      <ConfirmDialog
        visible={deleting !== null}
        eyebrow="SUPPRESSION"
        title={`Supprimer ${deleting?.name ?? ''} ?`}
        warning={deleting ? deletionWarning(deleting) : ''}
        confirmLabel="Supprimer"
        dismissLabel="GARDER"
        isBusy={isBusy}
        onConfirm={() => {
          if (!deleting) return;

          void deleteProgram(deleting.id).then(() => setDeleting(null));
        }}
        onDismiss={() => setDeleting(null)}
      />

      <ConfirmDialog {...confirmation} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    gap: gap.row,
  },
  list: {
    gap: spacing.row,
  },
});
