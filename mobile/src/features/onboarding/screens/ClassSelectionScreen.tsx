import { Button } from 'react-native';

import { PlaceholderScreen } from '../../../components/PlaceholderScreen';
import { useUserStore } from '../../../store/userStore';

export function ClassSelectionScreen() {
  const setProfile = useUserStore((s) => s.setProfile);
  const session = useUserStore((s) => s.session);

  // Placeholder : la vraie liste viendra de la table `classes` (lecture
  // publique), avec le `lore_intro` de chaque classe.
  const chooseDemoClass = () =>
    setProfile({
      id: session?.user.id ?? 'dev-user',
      username: null,
      classId: 'demo-class',
    });

  return (
    <PlaceholderScreen
      title="Choix de classe"
      description="Sélection de la classe et intro narrative (table `classes`, lore par classe / sport)."
    >
      <Button title="Choisir une classe (démo)" onPress={chooseDemoClass} />
    </PlaceholderScreen>
  );
}
