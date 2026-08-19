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
 * `verifyCode` ne navigue pas elle-même, elle rend sa réussite : la session
 * ouverte est observée par `useAuthBootstrap`, mais l'onboarding a encore une
 * étape après — écrire la classe choisie. C'est l'appelant qui sait où aller.
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
      setError(translateAuthError(otpError.message, 'request'));
      return;
    }

    setEmail(normalizedEmail);
    setCode('');
    setStep('code');
  }, [email]);

  /** @returns vrai si la session est ouverte. */
  const verifyCode = useCallback(async (): Promise<boolean> => {
    const normalizedCode = code.trim();

    if (normalizedCode.length !== OTP_LENGTH) {
      setError(`Le code compte ${OTP_LENGTH} chiffres.`);
      return false;
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
      setError(translateAuthError(verifyError.message, 'verify'));
      return false;
    }

    return true;
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
 *
 * L'étape est nécessaire, pas décorative : « invalid » qualifie l'adresse à
 * l'envoi et le code à la vérification. Sans elle, une adresse mal formée
 * s'annoncerait comme un code expiré et enverrait l'utilisateur corriger ce
 * qui n'est pas en cause.
 */
function translateAuthError(
  message: string,
  phase: 'request' | 'verify',
): string {
  const normalized = message.toLowerCase();
  const fallback = 'Connexion impossible pour le moment. Réessaie dans un instant.';

  if (
    normalized.includes('rate limit') ||
    normalized.includes('security purposes')
  ) {
    return 'Trop de demandes. Patiente une minute avant de réessayer.';
  }

  if (phase === 'request') {
    if (normalized.includes('email')) {
      return 'Adresse email refusée. Vérifie l’orthographe.';
    }

    console.warn('[auth] erreur Supabase non traduite (envoi) :', message);
    return fallback;
  }

  if (
    normalized.includes('expired') ||
    normalized.includes('invalid') ||
    normalized.includes('token')
  ) {
    return 'Code invalide ou expiré. Demande-en un nouveau.';
  }

  console.warn('[auth] erreur Supabase non traduite (vérification) :', message);
  return fallback;
}
