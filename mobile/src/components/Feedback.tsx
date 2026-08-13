import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme';
import { Button } from './ui';

/**
 * États d'attente et d'échec, mutualisés.
 *
 * Le DA ne nomme aucune couleur d'erreur : sa palette est celle du jeu, pas
 * celle d'un formulaire. Le message d'échec emprunte donc le rouge clair du
 * récit (`accent.rustLight`), en texte seulement — jamais en aplat, ce que le
 * §02 réserve au codex. C'est la lecture la plus fidèle possible d'une règle
 * qui n'a pas prévu le cas, et elle reste centralisée ici : le jour où le DA
 * tranche, un seul fichier change.
 */

/** Message d'échec, avec sa reprise quand l'action est rejouable. */
export function ErrorNotice({
  message,
  onRetry,
  retryLabel = 'Réessayer',
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <View style={styles.notice}>
      <Text style={styles.errorText} accessibilityRole="alert">
        {message}
      </Text>
      {onRetry ? (
        <Button label={retryLabel} onPress={onRetry} variant="secondary" size="compact" />
      ) : null}
    </View>
  );
}

/** Attente d'un chargement qui occupe tout l'écran. */
export function LoadingState() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.accent.gold} />
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    alignItems: 'center',
    gap: spacing.row,
  },
  errorText: {
    ...typography.sans.bodySmall,
    color: colors.accent.rustLight,
    textAlign: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.notch,
  },
});
