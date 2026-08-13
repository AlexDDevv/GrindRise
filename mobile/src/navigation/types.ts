import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * Pile d'onboarding, affichée tant que le joueur n'a pas de profil jouable.
 *
 * L'authentification en est une étape et non une pile séparée : le parcours
 * demande une adresse email en dernier, après les choix. Une pile d'auth
 * distincte obligerait à sortir de l'onboarding pour y revenir, en perdant la
 * position dans le parcours.
 */
export type OnboardingStackParamList = {
  Welcome: undefined;
  SportSelection: undefined;
  ClassSelection: undefined;
  Auth: undefined;
  /** Écriture de la classe scellée, une fois la session ouverte. */
  Finalize: undefined;
};

/**
 * Onglets principaux.
 *
 * Le codex n'y figure pas encore : il viendra dans une étape séparée.
 */
export type MainTabParamList = {
  Dashboard: undefined;
  Log: undefined;
  Profile: undefined;
};

/** Pile racine : bascule entre onboarding et app selon l'état du store. */
export type RootStackParamList = {
  Onboarding: NavigatorScreenParams<OnboardingStackParamList> | undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
};
