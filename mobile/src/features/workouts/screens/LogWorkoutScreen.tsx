import { PlaceholderScreen } from '../../../components/PlaceholderScreen';

export function LogWorkoutScreen() {
  return (
    <PlaceholderScreen
      title="Nouvelle séance"
      description={
        'Saisie des métriques (jsonb, variables selon le sport).\n' +
        "L'XP n'est jamais envoyée par le client : l'API calcule et insère l'`xp_event` après réception du log."
      }
    />
  );
}
