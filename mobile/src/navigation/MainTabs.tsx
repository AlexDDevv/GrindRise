import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { DashboardScreen } from '../features/dashboard/screens/DashboardScreen';
import { ProfileScreen } from '../features/profile/screens/ProfileScreen';
import { LogWorkoutScreen } from '../features/workouts/screens/LogWorkoutScreen';
import { border, colors, fontFamily, typography } from '../theme';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * Les trois onglets de l'app.
 *
 * « Log » ouvre le formulaire directement, sans écran d'accueil intermédiaire :
 * logger une séance est l'action que le joueur vient faire, et l'historique
 * complet se lit au profil. Le codex n'est pas encore là, il viendra dans une
 * étape séparée.
 *
 * Les en-têtes sont désactivés partout : chaque écran porte son titre en Grenze,
 * et une barre de navigation par-dessus ferait doublon.
 *
 * Les libellés sont en JetBrains Mono capitales — le §03 réserve cette famille
 * aux labels, ce que sont exactement trois mots d'onglet. La couleur n'est pas
 * posée dans le style mais par les `tintColor` : sinon elle écraserait la
 * distinction actif / inactif.
 */
export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent.gold,
        tabBarInactiveTintColor: colors.text.secondary,
        tabBarStyle: {
          backgroundColor: colors.surface.raised,
          borderTopWidth: border.hairline,
          borderTopColor: colors.line.default,
        },
        tabBarLabelStyle: {
          fontFamily: fontFamily.monoMedium,
          fontSize: typography.mono.meta.fontSize,
          letterSpacing: typography.mono.meta.letterSpacing,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'ACCUEIL',
          tabBarIcon: ({ color, size }) => <Ionicons name="flame" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Log"
        component={LogWorkoutScreen}
        options={{
          title: 'SÉANCE',
          tabBarIcon: ({ color, size }) => <Ionicons name="barbell" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'PROFIL',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}
