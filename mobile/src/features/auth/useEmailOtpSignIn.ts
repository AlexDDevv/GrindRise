import { useCallback, useState } from 'react';

import { supabase } from '../../lib/supabase';

/**
 * Étape courante du formulaire. Un seul écran, deux états — plutôt que deux
 * routes : revenir en arrière doit rejouer la saisie de l'email, pas restaurer
 * une navigation.
 */
export type SignInStep = 'email' | 'code';

/** Longueur du code émis par Supabase pour un OTP email. */
export const OTP_LENGTH = 6;

/**
 * Connexion par code à usage unique envoyé par email.
 *
 * Le magic link a été écarté : il impose un deep link de retour, or le scheme
 * diffère entre Expo Go (`exp://`) et un build EAS (`grindrise://`), ce qui
 * rend le parcours intestable avant le premier build cloud. Un code saisi à la
 * main n'a pas ce problème.
 *
 * Il n'y a pas d'écran d'inscription séparé : `shouldCreateUser` crée le compte
 * à la première demande de code, et le trigger sur `auth.users` pose le profil
 * et la progression dans la foulée.
 *
 * La réussite de `verifyCode` ne navigue pas : elle ouvre une session, que
 * `useAuthBootstrap` observe via `onAuthStateChange`. C'est le store qui fait
 * basculer le `RootNavigator`.
 */
export function useEmailOtpSignIn() {
  const [step, setStep] = useState<SignInStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestCode = useCallback(async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!isPlausibleEmail(normalizedEmail)) {
      setError('Adresse email invalide.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        // Même chemin pour l'inscription et la connexion.
        shouldCreateUser: true,
        // Surtout pas d'`emailRedirectTo` : sa présence pousse Supabase vers
        // le gabarit de lien plutôt que le code.
      },
    });

    setIsSubmitting(false);

    if (otpError) {
      setError(translateAuthError(otpError.message));
      return;
    }

    setEmail(normalizedEmail);
    setCode('');
    setStep('code');
  }, [email]);

  const verifyCode = useCallback(async () => {
    const normalizedCode = code.trim();

    if (normalizedCode.length !== OTP_LENGTH) {
      setError(`Le code compte ${OTP_LENGTH} chiffres.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: normalizedCode,
      type: 'email',
    });

    setIsSubmitting(false);

    if (verifyError) {
      setError(translateAuthError(verifyError.message));
      return;
    }

    // Aucune navigation ici : la session ouverte déclenche onAuthStateChange.
  }, [code, email]);

  const editEmail = useCallback(() => {
    setStep('email');
    setCode('');
    setError(null);
  }, []);

  return {
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
  };
}

/**
 * Filtre les fautes de frappe évidentes avant l'aller-retour réseau. La vraie
 * validation est faite par Supabase, qui seul sait si l'adresse est délivrable.
 */
function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Les messages de GoTrue sont en anglais et parfois cryptiques. On traduit les
 * cas que l'utilisateur peut réellement corriger, et on reste générique pour
 * le reste plutôt que d'afficher un message technique.
 */
function translateAuthError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes('expired') || normalized.includes('invalid')) {
    return 'Code invalide ou expiré. Demande-en un nouveau.';
  }

  if (normalized.includes('rate limit') || normalized.includes('security purposes')) {
    return 'Trop de demandes. Patiente une minute avant de réessayer.';
  }

  console.warn('[auth] erreur Supabase non traduite :', message);
  return 'Connexion impossible pour le moment. Réessaie dans un instant.';
}
