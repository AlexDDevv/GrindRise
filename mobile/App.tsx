import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeGalleryScreen } from './src/dev/ThemeGalleryScreen';
import { useAuthBootstrap } from './src/features/auth/useAuthBootstrap';
import { useOnboardingStore } from './src/features/onboarding/onboardingStore';
import { isThemeGalleryEnabled } from './src/lib/env';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useUserStore } from './src/store/userStore';
import { colors, useAppFonts } from './src/theme';

/**
 * Fond et accents de React Navigation.
 *
 * Sans lui, le conteneur peint son fond clair par défaut : chaque transition
 * d'écran laisserait passer un éclair blanc sur une app entièrement sombre.
 */
const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.surface.page,
    card: colors.surface.raised,
    text: colors.text.title,
    border: colors.line.default,
    primary: colors.accent.gold,
    notification: colors.accent.rust,
  },
};

export default function App() {
  useAuthBootstrap();
  const fontsReady = useAppFonts();
  const isSessionHydrated = useUserStore((s) => s.isHydrated);
  const isDraftHydrated = useOnboardingStore((s) => s.isHydrated);

  // Le splash natif tient l'écran jusqu'ici : rendre quoi que ce soit avant
  // que Grenze soit là ferait sauter la typographie sous les yeux.
  if (!fontsReady) {
    return null;
  }

  if (isThemeGalleryEnabled) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <ThemeGalleryScreen />
      </SafeAreaProvider>
    );
  }

  // Les deux relectures persistées conditionnent la première route affichée : la
  // session dit s'il faut l'onboarding, le brouillon dit où le reprendre. Monter
  // la navigation avant qu'elles soient là afficherait la page de bienvenue à
  // quelqu'un qui attend juste l'écriture de sa classe.
  const isReady = isSessionHydrated && isDraftHydrated;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {isReady ? (
        <NavigationContainer theme={navigationTheme}>
          <RootNavigator />
        </NavigationContainer>
      ) : (
        <View style={styles.booting}>
          <ActivityIndicator color={colors.accent.gold} />
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  booting: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.page,
  },
});
