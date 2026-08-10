import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useHasChosenClass, useIsAuthenticated } from '../store/userStore';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { OnboardingStack } from './OnboardingStack';
import type { RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

/**
 * Bascule conditionnelle entre les trois univers de l'app.
 *
 * On ne monte qu'une branche à la fois plutôt que de naviguer impérativement :
 * le changement d'état du store suffit à faire la transition, et il n'existe
 * aucun chemin pour revenir en arrière dans une pile qu'on vient de quitter.
 */
export function RootNavigator() {
  const isAuthenticated = useIsAuthenticated();
  const hasChosenClass = useHasChosenClass();

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <RootStack.Screen name="Auth" component={AuthStack} />
      ) : !hasChosenClass ? (
        <RootStack.Screen name="Onboarding" component={OnboardingStack} />
      ) : (
        <RootStack.Screen name="Main" component={MainTabs} />
      )}
    </RootStack.Navigator>
  );
}

// Typage global de `useNavigation` & co. sans annotation manuelle (RN 7).
type RootStackType = typeof RootStack;

declare module '@react-navigation/native' {
  interface RootNavigator extends RootStackType {}
}
