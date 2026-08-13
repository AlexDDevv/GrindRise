import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ErrorNotice } from '../../../components/Feedback';
import { Screen } from '../../../components/Screen';
import { LevelMedallion } from '../../../components/ui';
import type { OnboardingStackParamList } from '../../../navigation/types';
import { useUserStore } from '../../../store/userStore';
import { colors, spacing, typography } from '../../../theme';
import { completeOnboarding } from '../completeOnboarding';
import { useOnboardingStore } from '../onboardingStore';

/**
 * Écriture du choix scellé, dès qu'une session existe.
 *
 * Cet écran existe parce que les deux moitiés de l'onboarding ne peuvent pas se
 * rejoindre ailleurs : les choix se font avant l'authentification, l'écriture ne
 * peut se faire qu'après. Il tient le joueur pendant l'aller-retour, et surtout
 * il lui donne un endroit où réessayer si le réseau tombe — sans lui, un échec
 * laisserait un compte sans classe, donc un onboarding qui recommence à zéro.
 *
 * Il n'a rien à faire pour sortir : dès que `profiles.class_id` est écrit, le
 * `RootNavigator` monte la barre d'onglets et démonte cette pile. C'est aussi ce
 * qui garantit que l'écran reste affiché tant que l'écriture n'a pas abouti.
 *
 * La session n'est pas attendue par une boucle mais par un rendu : `verifyOtp`
 * ouvre la session, `useAuthBootstrap` l'applique au store, et l'effet part
 * quand elle arrive.
 */
export function FinalizeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList, 'Finalize'>>();

  const profileId = useUserStore((s) => s.session?.user.id ?? null);
  const classId = useOnboardingStore((s) => s.classId);
  const clearClassDraft = useOnboardingStore((s) => s.clearClassDraft);

  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!profileId || !classId) return;

    let isMounted = true;
    setError(null);

    void (async () => {
      try {
        await completeOnboarding(profileId, classId);

        // Le brouillon a fini son office. Le vider maintenant évite qu'un
        // prochain lancement reparte en finalisation pour une classe déjà en
        // base — sans dégât, mais pour rien.
        if (isMounted) clearClassDraft();
      } catch (cause) {
        if (isMounted) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Impossible de terminer la création de ton compte.',
          );
        }
      }
    })();

    return () => {
      isMounted = false;
    };
    // `attempt` est la dépendance qui rejoue l'écriture sur « Réessayer ».
  }, [attempt, classId, clearClassDraft, profileId]);

  // Les deux impasses possibles. Elles ne devraient pas se produire — on
  // n'arrive ici qu'avec un brouillon scellé, et la session ne se ferme pas
  // toute seule — mais un indicateur qui tourne sans fin serait le pire des
  // aboutissements pour un parcours d'inscription.
  if (!classId) {
    return (
      <Screen title="Choix perdu">
        <ErrorNotice
          message="Ton choix de classe n’a pas été retrouvé. Il faut le refaire, c’est la dernière étape."
          onRetry={() => navigation.navigate('ClassSelection')}
          retryLabel="Choisir ma voie"
        />
      </Screen>
    );
  }

  if (!profileId) {
    return (
      <Screen title="Session fermée">
        <ErrorNotice
          message="La connexion s’est interrompue avant la fin. Ton choix de classe est gardé."
          onRetry={() => navigation.navigate('Auth')}
          retryLabel="Se reconnecter"
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.stage}>
        <LevelMedallion level={1} size="l" />

        <Text style={[typography.display.hero, styles.centered]}>
          {error ? 'Presque' : 'Ton nom s’inscrit'}
        </Text>

        {error ? (
          <ErrorNotice message={error} onRetry={() => setAttempt((n) => n + 1)} />
        ) : (
          <>
            <Text style={[typography.sans.bodySmall, styles.centered]}>
              On scelle ta classe et on ouvre le premier fragment de ton récit.
            </Text>
            <ActivityIndicator color={colors.accent.gold} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    gap: spacing.block,
    paddingVertical: spacing.notch,
  },
  centered: {
    textAlign: 'center',
  },
});
