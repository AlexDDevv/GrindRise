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
 * **Les programmes vivent ici et nulle part ailleurs** — maquette 10, section A.
 * Ce ne sont pas une section de l'app mais une manière de démarrer une séance,
 * donc ils n'ont pas d'onglet : `StrengthStart` s'insère entre le choix du sport
 * et la séance, et ouvre les deux branches. La barre garde ses trois onglets, et
 * sa quatrième place reste au codex.
 *
 * `StrengthSummary` est une route et non un état d'écran, contrairement à ce que
 * fait `SportChoice` pour les sports plats : la pile est `reset` dessus, donc le
 * retour arrière ne ramène pas sur une séance déjà envoyée, et l'écran de séance
 * est démonté avec son état.
 */
export type LogStackParamList = {
  SportChoice: undefined;
  /** Départ musculation : séance libre ou programmes. */
  StrengthStart: undefined;
  Programs: undefined;
  /**
   * Ordre des exercices d'un jour type. Seul l'identifiant voyage : l'écran
   * relit le jour dans la liste, qui est de toute façon rechargée à chaque
   * retour. Faire voyager l'objet entier afficherait un nom périmé après un
   * renommage.
   */
  ProgramWorkout: { workoutId: string };
  StrengthSession: undefined;
  /**
   * Le catalogue sert deux destinations : la séance en cours, et un jour type
   * qu'on remplit. `addTo` dit laquelle — sans lui, l'exercice choisi
   * partirait toujours dans la séance.
   */
  ExerciseCatalog: { addTo: { workoutId: string } } | undefined;
  /**
   * Le résultat voyage en paramètre et non dans un store : c'est du JSON pur —
   * React Navigation ne se plaint que des valeurs non sérialisables — et il
   * n'appartient à personne après avoir été lu une fois.
   */
  StrengthSummary: { result: WorkoutResult };
};

/**
 * Pile de l'onglet « Accueil ».
 *
 * L'historique complet est un détail de l'accueil et non une section : on y va
 * depuis l'activité récente, on en revient. Il n'a donc pas d'onglet — la barre
 * en porte trois et le quatrième est promis au codex — mais un écran dans cette
 * pile, comme les programmes en ont un dans celle de la séance.
 */
export type DashboardStackParamList = {
  DashboardHome: undefined;
  History: undefined;
};

/**
 * Onglets principaux.
 *
 * Le codex n'y figure pas encore : il viendra dans une étape séparée.
 */
export type MainTabParamList = {
  Dashboard: NavigatorScreenParams<DashboardStackParamList> | undefined;
  Log: NavigatorScreenParams<LogStackParamList> | undefined;
  Profile: undefined;
};

/** Pile racine : bascule entre onboarding et app selon l'état du store. */
export type RootStackParamList = {
  Onboarding: NavigatorScreenParams<OnboardingStackParamList> | undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
};
