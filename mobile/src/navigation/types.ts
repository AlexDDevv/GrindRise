import type { NavigatorScreenParams } from '@react-navigation/native';

/** Pile affichée tant que l'utilisateur n'est pas connecté. */
export type AuthStackParamList = {
  SignIn: undefined;
};

/** Pile d'onboarding : choix de classe après la première connexion. */
export type OnboardingStackParamList = {
  ClassSelection: undefined;
};

/** Pile interne à l'onglet « Entraînement ». */
export type WorkoutsStackParamList = {
  WorkoutsHome: undefined;
  LogWorkout: { sportId?: string } | undefined;
};

/** Onglets principaux de l'app. */
export type MainTabParamList = {
  Home: undefined;
  Workouts: NavigatorScreenParams<WorkoutsStackParamList> | undefined;
  Progression: undefined;
};

/** Pile racine : bascule entre auth / onboarding / app selon l'état du store. */
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList> | undefined;
  Onboarding: NavigatorScreenParams<OnboardingStackParamList> | undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
};
