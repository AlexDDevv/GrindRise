import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import type { Database } from '../lib/database.types';

/**
 * Les types viennent directement du schéma généré : pas de couche de
 * correspondance à maintenir, et une colonne renommée en migration casse la
 * compilation au lieu de produire un `undefined` silencieux à l'exécution.
 * D'où le snake_case, qui est celui de la base.
 */
export type Profile = Database['public']['Tables']['profiles']['Row'];

/**
 * Cache d'affichage uniquement : la source de vérité est `xp_events` côté
 * serveur. Rien ici n'est renvoyé au backend pour attribuer de l'XP.
 */
export type Progress = Database['public']['Tables']['user_progress']['Row'];

type UserState = {
  session: Session | null;
  profile: Profile | null;
  progress: Progress | null;
  /** Faux tant que la session persistée n'a pas été relue au démarrage. */
  isHydrated: boolean;

  /**
   * Applique en une seule transition la session ET le contexte qu'elle
   * désigne.
   *
   * Poser la session seule ferait passer `isAuthenticated` à vrai avec un
   * profil encore nul : le `RootNavigator` monterait la pile d'onboarding pour
   * la démonter aussitôt le profil arrivé. Une session n'entre donc dans le
   * store qu'accompagnée de son profil — le type l'impose, il n'est pas
   * nullable ici.
   */
  applyAuthState: (next: {
    session: Session;
    profile: Profile;
    progress: Progress | null;
  }) => void;

  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setProgress: (progress: Progress | null) => void;
  setHydrated: (isHydrated: boolean) => void;
  reset: () => void;
};

const initialState = {
  session: null,
  profile: null,
  progress: null,
  isHydrated: false,
} satisfies Pick<UserState, 'session' | 'profile' | 'progress' | 'isHydrated'>;

export const useUserStore = create<UserState>((set) => ({
  ...initialState,

  applyAuthState: ({ session, profile, progress }) =>
    set({ session, profile, progress, isHydrated: true }),

  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setProgress: (progress) => set({ progress }),
  setHydrated: (isHydrated) => set({ isHydrated }),
  reset: () => set({ ...initialState, isHydrated: true }),
}));

/** L'utilisateur a une session valide. */
export const useIsAuthenticated = () => useUserStore((s) => s.session !== null);

/** L'onboarding est terminé quand une classe a été choisie. */
export const useHasChosenClass = () => useUserStore((s) => s.profile?.class_id != null);
