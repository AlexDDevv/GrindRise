import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { isSupabaseConfigured } from '../../../lib/env';
import { OTP_LENGTH, useEmailOtpSignIn } from '../useEmailOtpSignIn';

export function SignInScreen() {
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
      <View style={styles.container}>
        <Text style={styles.title}>Configuration manquante</Text>
        <Text style={styles.help}>
          Renseigne EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY dans
          mobile/.env, puis relance avec `expo start -c` pour vider le cache Metro.
        </Text>
      </View>
    );
  }

  const isEmailStep = step === 'email';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>
        {isEmailStep ? 'Entre dans l’arène' : 'Vérifie ta boîte mail'}
      </Text>

      <Text style={styles.help}>
        {isEmailStep
          ? 'On t’envoie un code à usage unique. Pas de mot de passe à retenir.'
          : `Code à ${OTP_LENGTH} chiffres envoyé à ${email}.`}
      </Text>

      {isEmailStep ? (
        <TextInput
          style={styles.input}
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
          onSubmitEditing={() => void requestCode()}
          accessibilityLabel="Adresse email"
        />
      ) : (
        <TextInput
          style={[styles.input, styles.codeInput]}
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
          onSubmitEditing={() => void verifyCode()}
          autoFocus
          accessibilityLabel={`Code à ${OTP_LENGTH} chiffres`}
        />
      )}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Pressable
        style={({ pressed }) => [
          styles.button,
          (pressed || isSubmitting) && styles.buttonPressed,
        ]}
        onPress={() => void (isEmailStep ? requestCode() : verifyCode())}
        disabled={isSubmitting}
        accessibilityRole="button"
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonLabel}>
            {isEmailStep ? 'Recevoir un code' : 'Se connecter'}
          </Text>
        )}
      </Pressable>

      {!isEmailStep ? (
        <View style={styles.secondaryActions}>
          <Pressable onPress={editEmail} disabled={isSubmitting} accessibilityRole="button">
            <Text style={styles.link}>Changer d’adresse</Text>
          </Pressable>
          <Pressable
            onPress={() => void requestCode()}
            disabled={isSubmitting}
            accessibilityRole="button"
          >
            <Text style={styles.link}>Renvoyer le code</Text>
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  help: {
    fontSize: 15,
    color: '#666',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  codeInput: {
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
  },
  error: {
    color: '#b3261e',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#1c1c1e',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  link: {
    color: '#1c1c1e',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
