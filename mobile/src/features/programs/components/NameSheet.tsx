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
import { NAME_MAX, NAME_MIN } from '../types';

/**
 * Feuille à un seul champ : nommer un programme, un jour type, ou les renommer.
 *
 * Le design dessine ces cas comme « deux feuilles au même gabarit » (Ⓑ) plus le
 * renommage (Ⓒ). Ce sont la même feuille : un nom, des raccourcis, une phrase
 * qui dit ce qui vient après. Trois composants divergeraient au premier
 * ajustement, et le gabarit lui-même est ce que la maquette prescrit.
 *
 * **Les noms tout prêts ne sont pas des exemples.** Un appui les écrit dans le
 * champ, où ils restent modifiables. C'est ce qui permet de créer un programme
 * en deux gestes sans clavier, cas de loin le plus fréquent — et personne
 * n'invente « Push Pull Legs » de mémoire au premier essai.
 *
 * L'erreur reste dans la feuille et n'en chasse pas la saisie, comme dans
 * `CreateExerciseSheet` : un nom refusé se corrige, il ne se retape pas.
 */

type Props = {
  visible: boolean;
  /** Surtitre mono : « NOUVEAU PROGRAMME », « PUSH PULL LEGS · NOUVEAU JOUR ». */
  eyebrow: string;
  fieldLabel: string;
  /** Pré-rempli au renommage, vide à la création. */
  initialName?: string;
  /** Noms tout prêts, écrits dans le champ d'un appui. */
  suggestions?: readonly string[];
  /** Ce qui se passe après la validation, dit avant de valider. */
  hint?: string;
  submitLabel: string;
  isBusy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (name: string) => void;
};

export function NameSheet({
  visible,
  eyebrow,
  fieldLabel,
  initialName = '',
  suggestions,
  hint,
  submitLabel,
  isBusy,
  error,
  onCancel,
  onSubmit,
}: Props) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (!visible) return;

    setName(initialName.slice(0, NAME_MAX));
  }, [visible, initialName]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length >= NAME_MIN && trimmed.length <= NAME_MAX && !isBusy;

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
            <Text style={typography.mono.meta} numberOfLines={1}>
              {eyebrow.toUpperCase()}
            </Text>
            <Pressable onPress={onCancel} accessibilityRole="button">
              <Text style={typography.mono.meta}>ANNULER</Text>
            </Pressable>
          </View>

          <TextField
            label={fieldLabel}
            value={name}
            onChangeText={setName}
            maxLength={NAME_MAX}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => {
              if (canSubmit) onSubmit(trimmed);
            }}
          />

          {suggestions && suggestions.length > 0 ? (
            <View style={styles.suggestions}>
              <Text style={typography.sans.metricLabel}>DÉPART RAPIDE</Text>
              <View style={styles.chips}>
                {suggestions.map((candidate) => (
                  <Pressable
                    key={candidate}
                    onPress={() => setName(candidate)}
                    accessibilityRole="button"
                    accessibilityLabel={`Nommer « ${candidate} »`}
                    style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                  >
                    <Text style={styles.chipLabel}>{candidate}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {hint ? <Text style={typography.sans.caption}>{hint}</Text> : null}

          {error ? <ErrorNotice message={error} /> : null}

          <Button
            label={isBusy ? 'Enregistrement…' : submitLabel}
            size="hero"
            disabled={!canSubmit}
            onPress={() => onSubmit(trimmed)}
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
    gap: gap.row,
    minHeight: touchTarget.minimum,
  },
  suggestions: { gap: gap.line },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: gap.line },
  chip: {
    justifyContent: 'center',
    minHeight: touchTarget.minimum,
    paddingHorizontal: padding.buttonCompact,
    borderWidth: border.hairline,
    borderColor: colors.line.control,
  },
  chipPressed: {
    backgroundColor: colors.control.activeBackground,
    borderColor: colors.control.activeBorder,
  },
  chipLabel: { ...typography.sans.rowAction, color: colors.text.body },
});
