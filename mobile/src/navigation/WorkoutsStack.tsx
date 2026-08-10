import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { LogWorkoutScreen } from '../features/workouts/screens/LogWorkoutScreen';
import { WorkoutsHomeScreen } from '../features/workouts/screens/WorkoutsHomeScreen';
import type { WorkoutsStackParamList } from './types';

const Stack = createNativeStackNavigator<WorkoutsStackParamList>();

export function WorkoutsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="WorkoutsHome"
        component={WorkoutsHomeScreen}
        options={{ title: 'Entraînements' }}
      />
      <Stack.Screen
        name="LogWorkout"
        component={LogWorkoutScreen}
        options={{ title: 'Nouvelle séance', presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
