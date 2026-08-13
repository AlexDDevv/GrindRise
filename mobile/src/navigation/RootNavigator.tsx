import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useIsOnboarded } from '../store/userStore';
import { MainTabs } from './MainTabs';
import { OnboardingStack } from './OnboardingStack';
import type { RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

/**
 * Bascule entre les deux univers de l'app.
 *
 * On ne monte qu'une branche à la fois plutôt que de naviguer impérativement :
 * le changement d'état du store suffit à faire la transition, et il n'existe
 * aucun chemin pour revenir en arrière dans une pile qu'on vient de quitter.
 *
 * L'authentification n'est plus une branche mais une étape de l'onboarding : la
 * frontière est « ce compte est-il jouable », pas « ce compte existe-t-il ».
 */
export function RootNavigator() {
  const isOnboarded = useIsOnboarded();

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {isOnboarded ? (
        <RootStack.Screen name="Main" component={MainTabs} />
      ) : (
        <RootStack.Screen name="Onboarding" component={OnboardingStack} />
      )}
    </RootStack.Navigator>
  );
}

// Typage global de `useNavigation` & co. sans annotation manuelle (RN 7).
type RootStackType = typeof RootStack;

declare module '@react-navigation/native' {
  interface RootNavigator extends RootStackType {}
}
