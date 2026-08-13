import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { SignInScreen } from '../features/auth/screens/SignInScreen';
import { ClassSelectionScreen } from '../features/onboarding/screens/ClassSelectionScreen';
import { FinalizeScreen } from '../features/onboarding/screens/FinalizeScreen';
import { SportSelectionScreen } from '../features/onboarding/screens/SportSelectionScreen';
import { WelcomeScreen } from '../features/onboarding/screens/WelcomeScreen';
import { useOnboardingStore } from '../features/onboarding/onboardingStore';
import { useIsAuthenticated } from '../store/userStore';
import type { OnboardingStackParamList } from './types';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

/**
 * Bienvenue → sport → classe → authentification → écriture.
 *
 * Les en-têtes sont désactivés : chaque écran porte son titre en Grenze et son
 * propre retour, comme le DA les dessine.
 *
 * Le point délicat est la reprise. Cette pile n'est montée que lorsque le joueur
 * n'a pas de profil jouable, ce qui couvre trois situations très différentes, et
 * repartir de la page de bienvenue serait faux dans deux d'entre elles :
 *
 * - **aucune session** : parcours normal, on commence au début ;
 * - **session ouverte, classe scellée dans le brouillon** : l'écriture a échoué
 *   ou l'app est morte juste après le code reçu. Il ne reste qu'à réessayer ;
 * - **session ouverte, aucun brouillon** : compte ouvert dont la classe n'a
 *   jamais été écrite. Il faut refaire les choix, mais plus l'authentification.
 *
 * L'arbitrage se fait une seule fois, au montage : `initialRouteName` n'est lu
 * qu'alors, et la pile n'est jamais remontée sans changement d'état racine.
 */
export function OnboardingStack() {
  const isAuthenticated = useIsAuthenticated();
  const hasClassDraft = useOnboardingStore((s) => s.classId !== null);

  const initialRoute = !isAuthenticated
    ? 'Welcome'
    : hasClassDraft
      ? 'Finalize'
      : 'SportSelection';

  return (
    <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="SportSelection" component={SportSelectionScreen} />
      <Stack.Screen name="ClassSelection" component={ClassSelectionScreen} />
      <Stack.Screen name="Auth" component={SignInScreen} />
      <Stack.Screen name="Finalize" component={FinalizeScreen} />
    </Stack.Navigator>
  );
}
