import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { HomeScreen } from '../features/home/screens/HomeScreen';
import { ProgressionScreen } from '../features/progression/screens/ProgressionScreen';
import type { MainTabParamList } from './types';
import { WorkoutsStack } from './WorkoutsStack';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Workouts"
        component={WorkoutsStack}
        options={{
          title: 'Entraînement',
          // La pile imbriquée gère son propre header.
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="barbell" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Progression"
        component={ProgressionScreen}
        options={{
          title: 'Progression',
          tabBarIcon: ({ color, size }) => <Ionicons name="trending-up" color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}
