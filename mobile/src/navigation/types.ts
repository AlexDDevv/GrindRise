import type { NavigatorScreenParams } from '@react-navigation/native';

import type { WorkoutResult } from '../features/workouts/workoutApi';

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
 * Pile de l'onglet « Séance ».
 *
 * L'onglet ne rend plus directement le formulaire : la musculation se logue en
 * exercices et séries, sur un parcours à part. Les autres sports restent sur
 * `SportChoice`, qui est le formulaire plat inchangé.
 *
 * `StrengthSummary` est une route et non un état d'écran, contrairement à ce que
 * fait `SportChoice` pour les sports plats : la pile est `reset` dessus, donc le
 * retour arrière ne ramène pas sur une séance déjà envoyée, et l'écran de séance
 * est démonté avec son état.
 */
export type LogStackParamList = {
  SportChoice: undefined;
  StrengthSession: undefined;
  ExerciseCatalog: undefined;
  /**
   * Le résultat voyage en paramètre et non dans un store : c'est du JSON pur —
   * React Navigation ne se plaint que des valeurs non sérialisables — et il
   * n'appartient à personne après avoir été lu une fois.
   */
  StrengthSummary: { result: WorkoutResult };
};

/**
 * Onglets principaux.
 *
 * Le codex n'y figure pas encore : il viendra dans une étape séparée.
 */
export type MainTabParamList = {
  Dashboard: undefined;
  Log: NavigatorScreenParams<LogStackParamList> | undefined;
  Profile: undefined;
};

/** Pile racine : bascule entre onboarding et app selon l'état du store. */
export type RootStackParamList = {
  Onboarding: NavigatorScreenParams<OnboardingStackParamList> | undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
};
