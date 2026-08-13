import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';

import { MissingSupabaseConfig } from '../../../components/Feedback';
import { Screen } from '../../../components/Screen';
import { Button, LevelMedallion } from '../../../components/ui';
import { isSupabaseConfigured } from '../../../lib/env';
import type { OnboardingStackParamList } from '../../../navigation/types';
import { border, colors, gap, padding, spacing, typography } from '../../../theme';

/**
 * Première page de l'app.
 *
 * Elle ne demande rien et ne charge rien : c'est le seul écran du parcours qui
 * n'attend aucun réseau, donc le premier affichage est immédiat même hors
 * connexion. Les deux étapes suivantes, elles, lisent des tables.
 *
 * Le médaillon de niveau 1 est là pour une raison précise : il montre l'unité de
 * mesure du jeu avant d'en parler. C'est la promesse de l'app en un objet.
 */

const PROMISES = [
  {
    label: 'SÉANCE',
    text: 'Chaque entraînement loggé rapporte de l’XP. Le serveur la calcule, jamais toi.',
  },
  {
    label: 'PALIER',
    text: 'L’XP fait monter des niveaux, et chaque niveau porte un titre.',
  },
  {
    label: 'RÉCIT',
    text: 'Ta classe donne le ton d’une histoire qui s’ouvre à mesure que tu progresses.',
  },
] as const;

export function WelcomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList, 'Welcome'>>();

  // Le dire ici et pas à la première requête : cet écran est le seul qui
  // s'affiche sans réseau, donc le premier endroit où le vrai symptôme est
  // visible.
  if (!isSupabaseConfigured) {
    return <MissingSupabaseConfig />;
  }

  return (
    <Screen
      eyebrow="BIENVENUE"
      title="Grindrise"
      intro="Un carnet d’entraînement qui compte les paliers plutôt que les calories."
      footer={
        <>
          <Button
            label="Commencer"
            size="hero"
            onPress={() => navigation.navigate('SportSelection')}
          />

          {/* Raccourci vers la dernière étape. Sans lui, un joueur qui se
              reconnecte traverserait deux écrans de choix pour des décisions
              déjà prises — et son compte porte déjà sa classe. */}
          <Button
            label="J’ai déjà un compte"
            variant="tertiary"
            onPress={() => navigation.navigate('Auth')}
          />
        </>
      }
    >
      <View style={styles.emblem}>
        <LevelMedallion level={1} size="l" />
      </View>

      <View style={styles.promises}>
        {PROMISES.map((promise) => (
          <View key={promise.label} style={styles.promise}>
            <Text style={typography.mono.label}>{promise.label}</Text>
            <Text style={typography.sans.bodySmall}>{promise.text}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  emblem: {
    alignItems: 'center',
    paddingVertical: spacing.block,
  },
  promises: {
    gap: spacing.list,
  },
  promise: {
    gap: gap.line,
    paddingVertical: padding.card.y,
    paddingHorizontal: padding.card.x,
    backgroundColor: colors.surface.raised,
    borderWidth: border.hairline,
    borderColor: colors.line.default,
  },
});
