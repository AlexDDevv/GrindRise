import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';

import { ChoiceCard } from '../../../components/ChoiceCard';
import { ErrorNotice, LoadingState } from '../../../components/Feedback';
import { Screen } from '../../../components/Screen';
import { Button } from '../../../components/ui';
import type { OnboardingStackParamList } from '../../../navigation/types';
import { spacing } from '../../../theme';
import { SportEmblem } from '../../sports/SportEmblem';
import { useSports } from '../../sports/useSports';
import { useOnboardingStore } from '../onboardingStore';

/**
 * Choix du sport de prédilection.
 *
 * Ce choix n'enferme rien : toutes les disciplines restent loggables ensuite, et
 * c'est ce que dit l'accroche. Il sert à deux choses — présélectionner le
 * formulaire de log, et filtrer les classes proposées à l'étape suivante quand
 * une classe spécifique à un sport existera en base.
 *
 * Le sport reste dans le brouillon local : `profiles` n'a pas de colonne pour
 * l'accueillir. Voir `onboardingStore` pour la conséquence.
 */
export function SportSelectionScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList, 'SportSelection'>>();

  const { sports, error, reload } = useSports();
  const selected = useOnboardingStore((s) => s.sportId);
  const chooseSport = useOnboardingStore((s) => s.chooseSport);

  return (
    <Screen
      eyebrow="ÉTAPE 1 SUR 2"
      title="Ta discipline"
      intro="Celle que tu pratiques le plus souvent. Tu pourras logger tous les autres sports sans rien changer."
      onBack={navigation.canGoBack() ? navigation.goBack : undefined}
      footer={
        <Button
          label="Continuer"
          onPress={() => navigation.navigate('ClassSelection')}
          disabled={selected === null}
        />
      }
    >
      {error ? <ErrorNotice message={error} onRetry={reload} /> : null}

      {!sports && !error ? <LoadingState /> : null}

      <View style={styles.list}>
        {sports?.map((sport) => (
          <ChoiceCard
            key={sport.id}
            title={sport.name}
            emblem={<SportEmblem icon={sport.icon} />}
            selected={sport.id === selected}
            onPress={() => chooseSport(sport.id)}
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
