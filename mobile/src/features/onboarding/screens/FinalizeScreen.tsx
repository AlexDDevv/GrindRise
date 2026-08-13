import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ErrorNotice } from '../../../components/Feedback';
import { Screen } from '../../../components/Screen';
import { Button, LevelMedallion } from '../../../components/ui';
import type { OnboardingStackParamList } from '../../../navigation/types';
import { useUserStore } from '../../../store/userStore';
import { colors, spacing, typography } from '../../../theme';
import { completeOnboarding } from '../completeOnboarding';
import { useOnboardingStore } from '../onboardingStore';

/**
 * Jonction des deux moitiés de l'onboarding.
 *
 * Les choix se font avant l'authentification, l'écriture ne peut se faire
 * qu'après : cet écran est le seul endroit où les deux se rejoignent. Il tient le
 * joueur pendant l'aller-retour, et surtout il lui donne un endroit où réessayer
 * si le réseau tombe — sans lui, un échec laisserait un compte sans classe, donc
 * un onboarding qui recommence à zéro.
 *
 * Il n'a rien à faire pour sortir : dès que `profiles.class_id` est écrit, le
 * `RootNavigator` monte la barre d'onglets et démonte cette pile. C'est aussi ce
 * qui garantit que l'écran reste affiché tant que l'écriture n'a pas abouti.
 *
 * Trois entrées mènent ici, et l'écran doit les distinguer :
 *
 * - **inscription** : brouillon scellé, compte neuf. Il écrit, c'est le cas
 *   normal ;
 * - **reconnexion** : le compte porte déjà une classe. Écraser le brouillon
 *   par-dessus serait le seul vrai dégât possible de ce parcours, l'ordre des
 *   écrans faisant traverser les choix à quelqu'un qui n'a rien à rechoisir ;
 * - **compte incomplet** : session ouverte, ni classe en base ni brouillon
 *   (raccourci « j'ai déjà un compte » suivi d'une première inscription). Il
 *   renvoie alors vers les choix, seule façon de ne pas laisser le joueur devant
 *   un indicateur qui tourne.
 *
 * L'attente est l'état par défaut, pas l'erreur : quand on arrive de l'écran de
 * code, la session est ouverte côté Supabase mais le store attend encore le
 * profil. Annoncer une session fermée pendant ces quelques centaines de
 * millisecondes serait faux. Le bouton de reprise couvre tous les blocages sans
 * avoir à en deviner la cause.
 */
export function FinalizeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList, 'Finalize'>>();

  const profileId = useUserStore((s) => s.session?.user.id ?? null);
  // Le store ne contient jamais une session sans son profil (invariant de
  // `useAuthBootstrap`) : dès que la session est là, cette valeur est fiable.
  const profile = useUserStore((s) => s.profile);
  const classId = useOnboardingStore((s) => s.classId);
  const clearClassDraft = useOnboardingStore((s) => s.clearClassDraft);

  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const hasClassInDatabase = profile?.class_id != null;

  useEffect(() => {
    if (!profileId || !profile) return;

    // Reconnexion : la classe est déjà en base, il n'y a rien à écrire. Le
    // brouillon est écarté pour qu'un prochain lancement ne le rejoue pas.
    if (hasClassInDatabase) {
      if (classId) clearClassDraft();
      return;
    }

    // Compte ouvert sans classe et sans brouillon : les choix restent à faire.
    if (!classId) {
      navigation.navigate('SportSelection');
      return;
    }

    let isMounted = true;
    setError(null);

    void (async () => {
      try {
        await completeOnboarding(profileId, classId);
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
  }, [attempt, classId, clearClassDraft, hasClassInDatabase, navigation, profile, profileId]);

  return (
    <Screen
      footer={
        // Toujours là : c'est la sortie de secours d'un écran qui, par nature,
        // attend quelque chose qui vient d'ailleurs.
        <Button
          label="Reprendre depuis le début"
          variant="tertiary"
          onPress={() => navigation.navigate('Welcome')}
        />
      }
    >
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
