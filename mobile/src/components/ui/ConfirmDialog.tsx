import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  border,
  colors,
  gap,
  maxWidth,
  padding,
  scrim,
  spacing,
  touchTarget,
  typography,
} from '../../theme';
import { Button } from './Button';

/**
 * Confirmation d'une action irréversible — maquette 10, écran Ⓒ.
 *
 * Elle remplace `Alert.alert` là où la maquette dessine une modale : l'alerte
 * système ignore le thème, et une suppression est exactement le moment où l'app
 * doit avoir l'air d'elle-même. Elle reste réservée aux gestes sans retour —
 * une confirmation devant chaque action apprendrait à les valider sans lire.
 *
 * **Ni or ni rouge sur le bouton qui détruit.** Le §02 donne l'or à la
 * progression et le rouge au récit ; ni l'un ni l'autre ne décrit une
 * suppression, et emprunter le rouge du codex ferait passer un avertissement
 * pour une annonce narrative. C'est `warning` qui porte le poids, en toutes
 * lettres : ce qui disparaît, et ce qui reste.
 *
 * L'écart est en tertiaire et non en secondaire, à l'inverse de l'usage
 * courant : sur une confirmation, garder est le choix par défaut, et deux
 * boutons de même force feraient hésiter au lieu de rassurer.
 */

type Props = {
  visible: boolean;
  /** Surtitre mono : « SUPPRESSION ». */
  eyebrow: string;
  /** Question posée en Grenze : « Supprimer Push Pull Legs ? ». */
  title: string;
  /** Ce qui disparaît, et ce qui survit. C'est lui qui avertit, pas la couleur. */
  warning: string;
  confirmLabel: string;
  /** Libellé de l'écart, en mono : « GARDER ». */
  dismissLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
  /** Vrai pendant que la suppression est en vol. */
  isBusy?: boolean;
};

export function ConfirmDialog({
  visible,
  eyebrow,
  title,
  warning,
  confirmLabel,
  dismissLabel,
  onConfirm,
  onDismiss,
  isBusy = false,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <View style={styles.banner}>
            <Text style={typography.mono.eyebrow}>{eyebrow}</Text>
          </View>

          <View style={styles.body}>
            <Text style={typography.display.cardTitle}>{title}</Text>
            <Text style={typography.sans.bodySmall}>{warning}</Text>

            <View style={styles.actions}>
              <Button
                label={confirmLabel}
                variant="secondary"
                size="ceremony"
                disabled={isBusy}
                onPress={onConfirm}
              />

              <Pressable
                onPress={onDismiss}
                disabled={isBusy}
                accessibilityRole="button"
                style={styles.dismiss}
              >
                <Text style={typography.mono.meta}>{dismissLabel}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.screen,
    backgroundColor: scrim.plain,
  },
  dialog: {
    width: '100%',
    maxWidth: maxWidth.dialog,
    backgroundColor: colors.surface.page,
    borderWidth: border.hairline,
    borderColor: colors.line.controlOnModal,
  },
  banner: {
    alignItems: 'center',
    paddingVertical: padding.modalBanner,
    backgroundColor: colors.surface.raised,
    borderBottomWidth: border.hairline,
    borderBottomColor: colors.line.default,
  },
  body: {
    gap: gap.modal,
    paddingVertical: padding.modalBody.y,
    paddingHorizontal: padding.modalBody.x,
  },
  actions: {
    gap: gap.line,
  },
  dismiss: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget.minimum,
  },
});
