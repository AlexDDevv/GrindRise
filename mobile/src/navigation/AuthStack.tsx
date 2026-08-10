import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { SignInScreen } from '../features/auth/screens/SignInScreen';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="SignIn" component={SignInScreen} options={{ title: 'Grindrise' }} />
    </Stack.Navigator>
  );
}
