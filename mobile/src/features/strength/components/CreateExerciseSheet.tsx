import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ErrorNotice } from '../../../components/Feedback';
import { TextField } from '../../../components/TextField';
import { Button } from '../../../components/ui';
import {
  border,
  colors,
  gap,
  padding,
  scrim,
  spacing,
  touchTarget,
  typography,
} from '../../../theme';
import { MUSCLE_GROUPS, muscleGroupLabel } from '../muscleGroups';
import type { MuscleGroup } from '../types';

/**
 * Création d'un exercice personnel.
 *
 * Non dessinée par la maquette, qui n'en montre que le bouton d'appel. La forme
 * suit celle de `SetEditorSheet` — une feuille basse, l'écran de départ visible
 * derrière — pour que les deux créations du parcours se ressemblent.
 *
 * Le groupe musculaire est **obligatoire** : l'enum Postgres est fermé et
 * `CreateExerciseDto` l'exige. Sans lui, les filtres et les statistiques par
 * groupe cesseraient d'être exploitables au premier exercice perso.
 *
 * L'erreur reste dans la feuille et n'en chasse pas la saisie : un 409
 * « Vous avez déjà un exercice de ce nom » se corrige en changeant deux
 * caractères, pas en tout retapant.
 */

/** `exercises_name_length` : `char_length(name) between 2 and 80`. */
const NAME_MIN = 2;
const NAME_MAX = 80;

type Props = {
  visible: boolean;
  /** Pré-rempli avec la recherche restée sans résultat. */
  initialName: string;
  isCreating: boolean;
  error: string | null;
  onCancel: () => void;
  onCreate: (name: string, group: MuscleGroup) => void;
};

export function CreateExerciseSheet({
  visible,
  initialName,
  isCreating,
  error,
  onCancel,
  onCreate,
}: Props) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState<MuscleGroup | null>(null);

  useEffect(() => {
    if (!visible) return;

    setName(initialName.slice(0, NAME_MAX));
    setGroup(null);
  }, [visible, initialName]);

  const trimmed = name.trim();
  const canCreate =
    trimmed.length >= NAME_MIN && trimmed.length <= NAME_MAX && group !== null && !isCreating;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissArea} onPress={onCancel} accessible={false} />

        <ScrollView
          style={styles.sheet}
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.head}>
            <Text style={typography.mono.meta}>NOUVEL EXERCICE</Text>
            <Pressable onPress={onCancel} accessibilityRole="button">
              <Text style={typography.mono.meta}>ANNULER</Text>
            </Pressable>
          </View>

          <TextField
            label="Nom"
            value={name}
            onChangeText={setName}
            maxLength={NAME_MAX}
            autoFocus
            returnKeyType="done"
          />

          <View style={styles.groups}>
            <Text style={typography.sans.metricLabel}>GROUPE MUSCULAIRE</Text>
            <View style={styles.chips}>
              {MUSCLE_GROUPS.map((candidate) => {
                const selected = candidate === group;

                return (
                  <Pressable
                    key={candidate}
                    onPress={() => setGroup(candidate)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={muscleGroupLabel(candidate)}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                      {muscleGroupLabel(candidate).toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {error ? <ErrorNotice message={error} /> : null}

          <Button
            label={isCreating ? 'Création…' : 'Créer et ajouter'}
            size="hero"
            disabled={!canCreate}
            onPress={() => {
              if (group !== null) onCreate(trimmed, group);
            }}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: scrim.plain },
  dismissArea: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface.page,
    borderTopWidth: border.hairline,
    borderTopColor: colors.line.controlOnModal,
  },
  sheetContent: {
    gap: spacing.block,
    paddingTop: padding.modalBody.y,
    paddingHorizontal: padding.modalBody.x,
    paddingBottom: spacing.notch,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget.minimum,
  },
  groups: { gap: gap.line },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: gap.line },
  chip: {
    justifyContent: 'center',
    minHeight: touchTarget.minimum,
    paddingHorizontal: padding.buttonCompact,
    borderWidth: border.hairline,
    borderColor: colors.line.control,
  },
  chipSelected: {
    backgroundColor: colors.control.activeBackground,
    borderColor: colors.control.activeBorder,
  },
  chipLabel: { ...typography.mono.meta, color: colors.control.label },
  chipLabelSelected: { color: colors.control.activeLabel },
});
