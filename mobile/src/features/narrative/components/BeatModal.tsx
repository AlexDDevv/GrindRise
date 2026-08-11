import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { UnlockedBeat } from '../narrativeState';

type Props = {
  beat: UnlockedBeat | null;
  onClose: () => void;
};

/**
 * Présentation d'un fragment.
 *
 * Le même composant sert les deux chemins — la modale automatique d'un fragment
 * non lu et l'ouverture explicite d'un fragment déjà lu — parce que c'est la
 * même lecture. Seul le bandeau change, pour que « nouveau » reste visible une
 * fois et une seule.
 *
 * Habillage volontairement nu : la direction artistique se décide en phase 3,
 * et une mise en scène posée ici serait à refaire.
 */
export function BeatModal({ beat, onClose }: Props) {
  return (
    <Modal
      visible={beat !== null}
      animationType="fade"
      transparent
      // Le retour arrière Android doit fermer, donc marquer comme lu : sans ça,
      // le fragment reviendrait à la prochaine ouverture du codex.
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {beat?.read_at === null ? (
            <Text style={styles.badge}>Nouveau fragment</Text>
          ) : null}

          <Text style={styles.title}>{beat?.title}</Text>

          <ScrollView style={styles.bodyScroll}>
            <Text style={styles.body}>{beat?.body}</Text>
          </ScrollView>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonLabel}>Fermer</Text>
          </Pressable>
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
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  card: {
    width: '100%',
    maxHeight: '80%',
    gap: 12,
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  badge: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#1c1c1e',
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  bodyScroll: {
    flexGrow: 0,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  button: {
    backgroundColor: '#1c1c1e',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
