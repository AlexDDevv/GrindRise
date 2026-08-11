import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useClassSelection, type GameClass } from '../useClassSelection';

export function ClassSelectionScreen() {
  const {
    classes,
    loadError,
    reloadClasses,
    selectedId,
    select,
    isSubmitting,
    submitError,
    confirmSelection,
  } = useClassSelection();

  if (loadError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error} accessibilityRole="alert">
          {loadError}
        </Text>
        <Pressable
          onPress={() => void reloadClasses()}
          accessibilityRole="button"
          style={styles.button}
        >
          <Text style={styles.buttonLabel}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }

  if (!classes) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (classes.length === 0) {
    // Ne devrait pas arriver : les classes sont seedées par migration. Mais un
    // écran vide sans explication laisserait l'utilisateur définitivement
    // coincé dans l'onboarding.
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>
          Aucune classe disponible. Contacte le support.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.list}>
        <Text style={styles.intro}>
          Ta classe façonne le récit de ta progression. Elle ne limite aucun
          sport.
        </Text>

        {classes.map((gameClass) => (
          <ClassCard
            key={gameClass.id}
            gameClass={gameClass}
            isSelected={gameClass.id === selectedId}
            onPress={() => select(gameClass.id)}
          />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        {submitError ? (
          <Text style={styles.error} accessibilityRole="alert">
            {submitError}
          </Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            (!selectedId || isSubmitting) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => void confirmSelection()}
          disabled={!selectedId || isSubmitting}
          accessibilityRole="button"
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonLabel}>Sceller mon choix</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

type ClassCardProps = {
  gameClass: GameClass;
  isSelected: boolean;
  onPress: () => void;
};

function ClassCard({ gameClass, isSelected, onPress }: ClassCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, isSelected && styles.cardSelected]}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={gameClass.name}
    >
      <Text style={styles.cardTitle}>{gameClass.name}</Text>
      {gameClass.lore_intro ? (
        <Text style={styles.cardLore}>{gameClass.lore_intro}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
    backgroundColor: '#fff',
  },
  list: {
    gap: 12,
    padding: 20,
  },
  intro: {
    fontSize: 15,
    color: '#666',
    marginBottom: 4,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  cardSelected: {
    borderColor: '#1c1c1e',
    borderWidth: 2,
    backgroundColor: '#f6f6f6',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardLore: {
    fontSize: 14,
    lineHeight: 20,
    color: '#555',
  },
  footer: {
    gap: 10,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  error: {
    color: '#b3261e',
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#1c1c1e',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonDisabled: {
    opacity: 0.4,
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
