import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeGalleryScreen } from './src/dev/ThemeGalleryScreen';
import { useAuthBootstrap } from './src/features/auth/useAuthBootstrap';
import { isThemeGalleryEnabled } from './src/lib/env';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useUserStore } from './src/store/userStore';
import { colors, useAppFonts } from './src/theme';

export default function App() {
  useAuthBootstrap();
  const fontsReady = useAppFonts();
  const isHydrated = useUserStore((s) => s.isHydrated);

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

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {isHydrated ? (
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      ) : (
        // Évite un flash de l'écran de connexion avant relecture de la session.
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
