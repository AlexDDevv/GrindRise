import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ErrorNotice } from '../../../components/Feedback';
import { TextField } from '../../../components/TextField';
import { Button, SegmentedControl, Switch } from '../../../components/ui';
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
import {
  TIME_SHORTCUTS_SECONDS,
  draftFrom,
  emptyDraft,
  parseDraft,
  repeatOf,
  step,
  switchType,
  type SetDraftInput,
} from '../setDraft';
import { formatSeconds, repsUnit } from '../sessionStats';
import type { SetDraft } from '../types';

/**
 * Saisie d'une série — maquette 09, écrans ③ et ③b.
 *
 * Une feuille basse et non un écran de la pile : la séance reste visible
 * derrière, et c'est ce qui permet de vérifier la série précédente sans quitter
 * la saisie.
 *
 * **Le brouillon est local et ne part qu'à la validation.** Dispatcher à chaque
 * frappe ferait traverser le réducteur pour rien. Toute la logique de ce
 * brouillon vit dans `setDraft.ts`, testée à part : ce fichier n'en est que le
 * rendu.
 *
 * **La barre de raccourcis est dans la feuille, au-dessus du bouton**, et non
 * accrochée au clavier système comme la maquette la dessine :
 * `InputAccessoryView` est iOS seulement et n'a pas d'équivalent Android. C'est
 * le seul choix qui donne le même comportement sur les deux plateformes.
 *
 * Trois états, trois libellés : `CHARGE` devient `LEST ADDITIONNEL` quand
 * l'interrupteur passe, et en temps la charge reste facultative.
 */

type Props = {
  visible: boolean;
  exerciseName: string;
  /** Rang affiché : « SÉRIE 4 ». */
  setNumber: number;
  /** Série à rouvrir en édition, ou nulle pour une nouvelle. */
  initial: SetDraft | null;
  /** Dernière série de l'exercice, pour « reprendre la précédente ». */
  previous: SetDraft | null;
  onCancel: () => void;
  onValidate: (set: SetDraft) => void;
};

export function SetEditorSheet({
  visible,
  exerciseName,
  setNumber,
  initial,
  previous,
  onCancel,
  onValidate,
}: Props) {
  const [draft, setDraft] = useState<SetDraftInput>(emptyDraft());
  const [error, setError] = useState<string | null>(null);

  // Remis à l'ouverture, et pas au montage : la feuille reste montée entre deux
  // séries, donc un `useState` initial garderait la saisie précédente.
  useEffect(() => {
    if (!visible) return;

    setDraft(initial === null ? emptyDraft() : draftFrom(initial));
    setError(null);
  }, [visible, initial]);

  const isTime = draft.type === 'time';

  const validate = () => {
    const result = parseDraft(draft);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    onValidate(result.set);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissArea} onPress={onCancel} accessible={false} />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={styles.sheet}
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.head}>
              <Text style={typography.mono.meta}>
                SÉRIE {setNumber} · {exerciseName.toUpperCase()}
              </Text>
              <Pressable onPress={onCancel} accessibilityRole="button">
                <Text style={typography.mono.meta}>ANNULER</Text>
              </Pressable>
            </View>

            <SegmentedControl
              options={[
                { value: 'reps', label: 'Répétitions' },
                { value: 'time', label: 'Temps' },
              ]}
              value={draft.type}
              onChange={(type) => setDraft((d) => switchType(d, type))}
              accessibilityLabel="Comment se compte cette série"
            />

            <View style={styles.fields}>
              <View style={styles.field}>
                <TextField
                  label={isTime ? 'Durée' : 'Répétitions'}
                  emphasis="metric"
                  unitInline={isTime ? 's' : repsUnit(Number.parseInt(draft.count, 10))}
                  value={draft.count}
                  onChangeText={(count) => setDraft((d) => ({ ...d, count }))}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  autoFocus
                />
              </View>

              <View style={styles.field}>
                <TextField
                  label={draft.isBodyweight ? 'Lest additionnel' : 'Charge'}
                  emphasis="metric"
                  unitInline="kg"
                  optional
                  value={draft.weight}
                  onChangeText={(weight) => setDraft((d) => ({ ...d, weight }))}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
            </View>

            <Switch
              label="Au poids du corps"
              value={draft.isBodyweight}
              onValueChange={(isBodyweight) => setDraft((d) => ({ ...d, isBodyweight }))}
            />

            {draft.isBodyweight ? (
              <Text style={typography.sans.caption}>
                Laisse le lest vide pour une série nue.
              </Text>
            ) : null}

            {isTime ? (
              <Shortcuts label="DURÉES COURANTES">
                {TIME_SHORTCUTS_SECONDS.map((seconds) => (
                  <Chip
                    key={seconds}
                    label={formatSeconds(seconds)}
                    onPress={() => setDraft((d) => ({ ...d, count: String(seconds) }))}
                  />
                ))}
              </Shortcuts>
            ) : (
              <Shortcuts label="RACCOURCIS">
                <Chip label="−1" onPress={() => setDraft((d) => step(d, -1))} />
                <Chip label="+1" onPress={() => setDraft((d) => step(d, 1))} />
                {previous ? (
                  <Chip
                    label={labelOfPrevious(previous)}
                    onPress={() => setDraft(repeatOf(previous))}
                  />
                ) : null}
              </Shortcuts>
            )}

            {error ? <ErrorNotice message={error} /> : null}

            <Button label="Valider la série" size="hero" onPress={validate} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function Shortcuts({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.shortcuts}>
      <Text style={typography.mono.meta}>{label}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.chip}
    >
      <Text style={typography.sans.metricInline}>{label}</Text>
    </Pressable>
  );
}

/** « 8 × 90 kg » — de quoi reconnaître la série sans la relire en entier. */
function labelOfPrevious(set: SetDraft): string {
  const count = set.type === 'reps' ? `${set.reps}` : formatSeconds(set.durationSeconds);
  const load = set.weightKg === null ? (set.isBodyweight ? 'PDC' : '—') : `${set.weightKg} kg`;

  return `${count} × ${load}`;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: scrim.plain,
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.surface.page,
    borderTopWidth: border.hairline,
    borderTopColor: colors.line.controlOnModal,
  },
  // `ScrollView` n'applique pas `gap` (ni les rembourrages qu'on lui donnerait
  // en `style`) à son conteneur : ils vivent ici, sur le contenu qui défile,
  // comme `Screen` le fait déjà entre `styles.content` et le `ScrollView` lui-même.
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
  fields: {
    flexDirection: 'row',
    gap: gap.row,
  },
  field: {
    flex: 1,
  },
  shortcuts: {
    gap: gap.line,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: gap.line,
  },
  chip: {
    justifyContent: 'center',
    minHeight: touchTarget.minimum,
    paddingHorizontal: padding.buttonCompact,
    borderWidth: border.hairline,
    borderColor: colors.line.control,
  },
});
