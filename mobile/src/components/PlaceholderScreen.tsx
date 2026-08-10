import { StyleSheet, Text, View } from 'react-native';

type Props = {
  title: string;
  description?: string;
  children?: React.ReactNode;
};

/**
 * Écran vide de squelette. À remplacer feature par feature — il n'existe que
 * pour rendre la navigation parcourable avant que les écrans réels existent.
 */
export function PlaceholderScreen({ title, description, children }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
});
