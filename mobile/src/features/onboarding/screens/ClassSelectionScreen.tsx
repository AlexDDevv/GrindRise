import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceCard } from '../../../components/ChoiceCard';
import { ErrorNotice, LoadingState } from '../../../components/Feedback';
import { Screen } from '../../../components/Screen';
import { Button } from '../../../components/ui';
import type { OnboardingStackParamList } from '../../../navigation/types';
import { useIsAuthenticated } from '../../../store/userStore';
import { spacing } from '../../../theme';
import { useOnboardingStore } from '../onboardingStore';
import { useClasses } from '../useClasses';

/**
 * Choix de la classe, dernière décision avant le compte.
 *
 * Le `lore_intro` est ce qui fait choisir, il ne peut donc pas être un détail
 * qu'on découvre après : `ChoiceCard` l'ouvre dès la sélection, et les quatre
 * lores ne s'affichent jamais ensemble — un mur de texte ne se lit pas.
 *
 * La classe n'entre dans le brouillon qu'au moment de sceller, pas à la
 * sélection. La nuance compte : le brouillon déclenche l'écriture en base dès
 * qu'une session existe, donc y poser une carte simplement effleurée
 * reviendrait à s'engager en la touchant.
 */
export function ClassSelectionScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList, 'ClassSelection'>>();

  const sportId = useOnboardingStore((s) => s.sportId);
  const chooseClass = useOnboardingStore((s) => s.chooseClass);
  const { classes, error, reload } = useClasses(sportId);

  // Vrai uniquement en reprise : un compte ouvert dont la classe n'a jamais été
  // écrite (choix interrompu, brouillon perdu). Le parcours normal arrive ici
  // sans session — l'authentification est l'étape suivante.
  const isAuthenticated = useIsAuthenticated();

  const [selected, setSelected] = useState<string | null>(null);

  const seal = () => {
    if (!selected) return;

    chooseClass(selected);
    // La classe ne peut pas s'écrire ici quand le compte n'existe pas encore :
    // `FinalizeScreen` s'en charge dès qu'une session est ouverte.
    navigation.navigate(isAuthenticated ? 'Finalize' : 'Auth');
  };

  return (
    <Screen
      eyebrow="ÉTAPE 2 SUR 2"
      title="Ta voie"
      intro="Elle façonne le ton de ton récit, jamais tes droits : aucune classe ne limite un sport."
      onBack={navigation.canGoBack() ? navigation.goBack : undefined}
      footer={
        <Button label="Sceller mon choix" onPress={seal} disabled={selected === null} />
      }
    >
      {error ? <ErrorNotice message={error} onRetry={reload} /> : null}

      {!classes && !error ? <LoadingState /> : null}

      {classes?.length === 0 ? (
        // Ne devrait pas arriver, les classes sont seedées par migration. Mais
        // une liste vide sans explication laisserait le joueur définitivement
        // coincé dans l'onboarding.
        <ErrorNotice message="Aucune classe disponible pour ce sport. Contacte le support." />
      ) : null}

      <View style={styles.list}>
        {classes?.map((gameClass) => (
          <ChoiceCard
            key={gameClass.id}
            title={gameClass.name}
            detail={gameClass.lore_intro}
            selected={gameClass.id === selected}
            onPress={() => setSelected(gameClass.id)}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.list,
  },
});
