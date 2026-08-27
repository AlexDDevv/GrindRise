import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ProgramWorkoutScreen } from '../features/programs/screens/ProgramWorkoutScreen';
import { ProgramsScreen } from '../features/programs/screens/ProgramsScreen';
import { ExerciseCatalogScreen } from '../features/strength/screens/ExerciseCatalogScreen';
import { StrengthSessionScreen } from '../features/strength/screens/StrengthSessionScreen';
import { StrengthStartScreen } from '../features/strength/screens/StrengthStartScreen';
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
 *
 * **Les programmes sont dans cette pile et pas dans un onglet** — maquette 10,
 * section A. Ce ne sont pas une section de l'app mais une manière de démarrer
 * une séance : `StrengthStart` s'insère entre le choix du sport et la séance,
 * et ouvre les deux branches. Un coureur ne voit jamais ces écrans.
 */
export function LogNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SportChoice" component={LogWorkoutScreen} />
      <Stack.Screen name="StrengthStart" component={StrengthStartScreen} />
      <Stack.Screen name="Programs" component={ProgramsScreen} />
      <Stack.Screen name="ProgramWorkout" component={ProgramWorkoutScreen} />
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
