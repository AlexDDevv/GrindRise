import { Screen } from '../../../components/Screen';

/**
 * Écran de fin de séance de musculation — version minimale.
 *
 * Juste assez pour que la pile de `LogNavigator` compile et se navigue : la
 * Task 14 le remplace entièrement par le résumé de la séance (exercices, XP,
 * paliers franchis), qui lira `result` dans les paramètres de la route.
 */
export function StrengthSummaryScreen() {
  return <Screen title="Séance enregistrée" />;
}
