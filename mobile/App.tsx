import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAuthBootstrap } from './src/features/auth/useAuthBootstrap';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useUserStore } from './src/store/userStore';

export default function App() {
  useAuthBootstrap();
  const isHydrated = useUserStore((s) => s.isHydrated);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {isHydrated ? (
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      ) : (
        // Évite un flash de l'écran de connexion avant relecture de la session.
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      )}
    </SafeAreaProvider>
  );
}
