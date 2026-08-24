import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ExerciseCatalogScreen } from '../features/strength/screens/ExerciseCatalogScreen';
import { StrengthSessionScreen } from '../features/strength/screens/StrengthSessionScreen';
import { StrengthSummaryScreen } from '../features/strength/screens/StrengthSummaryScreen';
import { LogWorkoutScreen } from '../features/workouts/screens/LogWorkoutScreen';
import type { LogStackParamList } from './types';

const Stack = createNativeStackNavigator<LogStackParamList>();

/**
 * Le parcours de log, de la discipline à la séance enregistrée.
 *
 * Les en-têtes restent désactivés : chaque écran porte son titre en Grenze via
 * `Screen`, et une barre de navigation par-dessus ferait doublon — c'est la
 * règle que `MainTabs` applique déjà.
 *
 * Le catalogue est présenté en modale : il interrompt la séance sans la quitter,
 * et son geste de sortie est le même que celui d'une feuille.
 */
export function LogNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SportChoice" component={LogWorkoutScreen} />
      <Stack.Screen name="StrengthSession" component={StrengthSessionScreen} />
      <Stack.Screen
        name="ExerciseCatalog"
        component={ExerciseCatalogScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen name="StrengthSummary" component={StrengthSummaryScreen} />
    </Stack.Navigator>
  );
}
