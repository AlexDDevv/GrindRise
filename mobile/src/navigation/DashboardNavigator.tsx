import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { DashboardScreen } from '../features/dashboard/screens/DashboardScreen';
import { HistoryScreen } from '../features/workouts/screens/HistoryScreen';
import type { DashboardStackParamList } from './types';

const Stack = createNativeStackNavigator<DashboardStackParamList>();

/**
 * L'accueil, et ce qui se déplie depuis lui.
 *
 * L'onglet rendait jusqu'ici l'écran directement. L'historique complet a besoin
 * d'un écran à lui — la maquette D1 en dessine l'entrée, « tout voir » à côté
 * d'« Activité récente » — donc l'onglet devient une pile.
 *
 * Une pile plutôt qu'un onglet de plus : la barre en porte trois, un quatrième
 * est promis au codex, et l'historique est un détail de l'accueil et non une
 * section — on y va depuis l'activité récente, on en revient. C'est le même
 * raisonnement qui a mis les programmes dans la pile de la séance.
 *
 * Les en-têtes restent désactivés : chaque écran porte son titre en Grenze via
 * `Screen`, et une barre de navigation par-dessus ferait doublon.
 */
export function DashboardNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DashboardHome" component={DashboardScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
    </Stack.Navigator>
  );
}
