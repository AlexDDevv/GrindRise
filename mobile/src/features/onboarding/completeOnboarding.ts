import { apiRequest, ApiError } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { useUserStore, type Profile } from '../../store/userStore';
import type { NarrativeBeat } from '../narrative/narrativeState';

/**
 * Dernier geste de l'onboarding : sceller la classe, puis ouvrir le récit.
 *
 * Deux appels, dans cet ordre, et l'ordre n'est pas indifférent : le déblocage
 * narratif est une conséquence du compte devenu utilisable, pas l'inverse. Si le
 * premier échoue, le second n'a rien à débloquer.
 *
 * ### Pourquoi l'écriture passe par Supabase et le déblocage par l'API
 *
 * `profiles.class_id` est une mise à jour de sa propre ligne, exactement le cas
 * que `profiles_update_own` couvre — la faire transiter par l'API n'ajouterait
 * qu'un saut réseau. Le déblocage, lui, écrit dans `user_narrative_unlocks`, où
 * le client n'a aucune policy d'écriture : c'est un événement de progression,
 * donc l'API et elle seule.
 *
 * ### Ce que le beat de niveau 1 exige
 *
 * `POST /narrative/sync` rattrape les déblocages en retard et renvoie
 * `{ unlocked: NarrativeBeat[] }`. Sans cet appel, un joueur qui termine
 * l'onboarding et ouvre le codex le trouverait vide jusqu'à sa première séance :
 * rien d'autre dans le parcours ne déclenche de synchronisation.
 *
 * À ne pas lire comme « choisir une classe débloque du contenu » : la classe
 * n'entre pas dans le calcul de déblocage (voir `narrative-rules.ts` côté API).
 * C'est le seul moment du parcours où le compte devient utilisable.
 */

export type OnboardingCompletion = {
  profile: Profile;
  /**
   * Beats ouverts par la sortie de l'onboarding. Vide si la synchronisation a
   * échoué — ce n'est pas une preuve qu'aucun n'a été franchi, `GET /narrative`
   * resynchronise à la première ouverture du codex.
   */
  unlocked: NarrativeBeat[];
};

/** Levée quand la classe n'a pas pu s'écrire. Le compte reste sans classe. */
export class OnboardingError extends Error {}

/**
 * @param profileId identifiant de la session courante. C'est `auth.users.id`,
 *   donc aussi `profiles.id` — la même valeur par construction du schéma.
 * @param classId classe choisie.
 */
export async function completeOnboarding(
  profileId: string,
  classId: string,
): Promise<OnboardingCompletion> {
  // `.select().single()` n'est pas décoratif : un UPDATE que la RLS filtre ne
  // lève aucune erreur, il réussit en touchant zéro ligne. Sans demander la
  // ligne en retour, « pas d'erreur » se lirait à tort comme « écrit », et le
  // joueur resterait dans l'onboarding sans le moindre message. `single()` sur
  // zéro ligne, lui, échoue.
  const { data, error } = await supabase
    .from('profiles')
    .update({ class_id: classId })
    .eq('id', profileId)
    .select()
    .single();

  if (error) {
    console.warn('[onboarding] écriture de la classe impossible :', error.message);
    throw new OnboardingError('Impossible d’enregistrer ton choix. Réessaie.');
  }

  // Le profil porte désormais une classe : publié tout de suite pour que la
  // bascule de navigation n'attende pas l'aller-retour narratif.
  useUserStore.getState().setProfile(data);

  try {
    const { unlocked } = await apiRequest<{ unlocked: NarrativeBeat[] }>(
      '/narrative/sync',
      { method: 'POST' },
    );

    return { profile: data, unlocked };
  } catch (cause) {
    // Échec sans conséquence durable, donc sans message : la classe est écrite,
    // le compte est utilisable, et le codex se rattrape à sa première lecture.
    // Le faire remonter en erreur renverrait le joueur sur un écran qu'il vient
    // de terminer pour un contenu qu'il n'a pas encore demandé à voir.
    console.warn(
      '[onboarding] synchronisation narrative impossible :',
      cause instanceof ApiError ? cause.message : cause,
    );

    return { profile: data, unlocked: [] };
  }
}
