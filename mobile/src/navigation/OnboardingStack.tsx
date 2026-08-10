import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ClassSelectionScreen } from '../features/onboarding/screens/ClassSelectionScreen';
import type { OnboardingStackParamList } from './types';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ClassSelection"
        component={ClassSelectionScreen}
        options={{ title: 'Choisis ta voie' }}
      />
    </Stack.Navigator>
  );
}
