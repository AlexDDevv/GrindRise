import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';

import { ErrorNotice } from '../../../components/Feedback';
import { Screen } from '../../../components/Screen';
import { TextField } from '../../../components/TextField';
import { Button } from '../../../components/ui';
import { isSupabaseConfigured } from '../../../lib/env';
import type { OnboardingStackParamList } from '../../../navigation/types';
import { spacing } from '../../../theme';
import { OTP_LENGTH, useEmailOtpSignIn } from '../useEmailOtpSignIn';

/**
 * Dernière étape de l'onboarding : ouvrir le compte.
 *
 * Elle vient après les choix et non avant, ce qui est le but du parcours — on ne
 * demande une adresse email qu'à quelqu'un qui a déjà décidé de jouer. La
 * conséquence technique est que la classe choisie attend dans le brouillon
 * pendant tout cet écran, et que `FinalizeScreen` prend la suite.
 *
 * Un seul écran pour deux étapes (adresse, puis code) : revenir en arrière doit
 * rejouer la saisie de l'adresse, pas restaurer une navigation.
 */
export function SignInScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList, 'Auth'>>();

  const {
    step,
    email,
    setEmail,
    code,
    setCode,
    isSubmitting,
    error,
    requestCode,
    verifyCode,
    editEmail,
  } = useEmailOtpSignIn();

  if (!isSupabaseConfigured) {
    return (
      <Screen
        title="Configuration manquante"
        intro="Renseigne EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY dans mobile/.env, puis relance avec `expo start -c` pour vider le cache Metro."
      />
    );
  }

  const isEmailStep = step === 'email';

  const submit = async () => {
    if (isEmailStep) {
      await requestCode();
      return;
    }

    // La session ouverte ne suffit pas à sortir de l'onboarding : la classe
    // scellée n'est pas encore en base. C'est `FinalizeScreen` qui l'écrit, et
    // lui seul décide quand la pile se démonte.
    if (await verifyCode()) {
      navigation.navigate('Finalize');
    }
  };

  return (
    <Screen
      eyebrow={isEmailStep ? 'DERNIÈRE ÉTAPE' : `CODE À ${OTP_LENGTH} CHIFFRES`}
      title={isEmailStep ? 'Entre dans l’arène' : 'Vérifie ta boîte mail'}
      intro={
        isEmailStep
          ? 'On t’envoie un code à usage unique. Pas de mot de passe à retenir.'
          : `Envoyé à ${email}. Il expire vite, garde-le sous les yeux.`
      }
      onBack={isEmailStep && navigation.canGoBack() ? navigation.goBack : undefined}
      avoidKeyboard
      footer={
        <>
          {error ? <ErrorNotice message={error} /> : null}

          {/* Le bouton du DA n'a pas d'état de chargement : l'attente se dit
              dans le libellé plutôt qu'en glissant un indicateur dans un
              composant validé. */}
          <Button
            label={
              isSubmitting
                ? 'Un instant…'
                : isEmailStep
                  ? 'Recevoir un code'
                  : 'Se connecter'
            }
            onPress={() => void submit()}
            disabled={isSubmitting}
          />

          {isEmailStep ? null : (
            <View style={styles.secondaryActions}>
              <Button
                label="Changer d’adresse"
                onPress={editEmail}
                variant="tertiary"
                size="compact"
                disabled={isSubmitting}
              />
              <Button
                label="Renvoyer le code"
                onPress={() => void requestCode()}
                variant="tertiary"
                size="compact"
                disabled={isSubmitting}
              />
            </View>
          )}
        </>
      }
    >
      {isEmailStep ? (
        <TextField
          label="Adresse email"
          value={email}
          onChangeText={setEmail}
          placeholder="toi@exemple.fr"
          inputMode="email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          editable={!isSubmitting}
          returnKeyType="send"
          onSubmitEditing={() => void submit()}
        />
      ) : (
        <TextField
          label="Code reçu"
          emphasis
          value={code}
          onChangeText={setCode}
          placeholder="000000"
          inputMode="numeric"
          keyboardType="number-pad"
          maxLength={OTP_LENGTH}
          // Permet le remplissage automatique du code depuis l'email sur iOS.
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          editable={!isSubmitting}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          autoFocus
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.row,
  },
});
