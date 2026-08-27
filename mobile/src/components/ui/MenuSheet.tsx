import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  border,
  colors,
  padding,
  scrim,
  touchTarget,
  typography,
} from '../../theme';

/**
 * Menu d'actions sur un objet nommé — maquette 10, écran Ⓒ.
 *
 * Ce que le design appelle « le menu de trois points » : il sert les opérations
 * qui ne méritent pas une place dans le corps de l'écran — renommer, supprimer,
 * ajouter — au même endroit sur un programme comme sur un jour type. Un seul
 * composant pour les deux, parce que ce sont les mêmes gestes.
 *
 * **Aucun rouge sur l'action destructrice**, et c'est délibéré : le §02 réserve
 * le rouge au récit et l'or à la progression, donc ni l'un ni l'autre ne peut
 * marquer une suppression. `danger` la pose en texte secondaire, un cran sous
 * les autres, et c'est la confirmation qui porte l'avertissement — voir
 * `ConfirmDialog`.
 *
 * Il ne confirme rien lui-même : chaque action remonte telle quelle, et
 * l'appelant décide de ce qu'elle ouvre.
 */

export type MenuAction = {
  label: string;
  onPress: () => void;
  /**
   * Action irréversible : posée en retrait, jamais colorée. Elle reste la
   * dernière de la liste par convention d'appel, pas par tri automatique — un
   * tri masquerait un ordre décidé par l'appelant.
   */
  danger?: boolean;
};

type Props = {
  visible: boolean;
  /** Nom de l'objet, en surtitre mono : « PUSH PULL LEGS ». */
  title: string;
  actions: MenuAction[];
  onClose: () => void;
};

export function MenuSheet({ visible, title, actions, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissArea} onPress={onClose} accessible={false} />

        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={typography.mono.meta} numberOfLines={1}>
              {title.toUpperCase()}
            </Text>
          </View>

          {actions.map((action) => (
            <Pressable
              key={action.label}
              onPress={() => {
                // Fermé avant d'agir : l'action ouvre souvent une autre feuille,
                // et deux modales empilées ne se ferment pas proprement sur iOS.
                onClose();
                action.onPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
            >
              <Text style={[styles.actionLabel, action.danger && styles.dangerLabel]}>
                {action.label}
              </Text>
            </Pressable>
          ))}

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => [styles.close, pressed && styles.actionPressed]}
          >
            <Text style={typography.mono.meta}>FERMER</Text>
          </Pressable>
        </View>
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
  head: {
    paddingVertical: padding.dense.y,
    paddingHorizontal: padding.modalBody.x,
    borderBottomWidth: border.hairline,
    borderBottomColor: colors.line.default,
  },
  action: {
    justifyContent: 'center',
    minHeight: touchTarget.secondary,
    paddingHorizontal: padding.modalBody.x,
    borderBottomWidth: border.hairline,
    borderBottomColor: colors.line.default,
  },
  actionPressed: {
    backgroundColor: colors.surface.raised,
  },
  actionLabel: {
    ...typography.sans.rowAction,
    color: colors.text.titleSoft,
  },
  dangerLabel: {
    color: colors.text.body,
  },
  close: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget.secondary,
    backgroundColor: colors.surface.raised,
  },
});
