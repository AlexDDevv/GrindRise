import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

/** Miroir local de `profiles` (Supabase). */
export type Profile = {
  id: string;
  username: string | null;
  classId: string | null;
};

/**
 * Miroir local de `user_progress`.
 *
 * Cache d'affichage uniquement : la source de vérité est `xp_events` côté
 * serveur. Rien ici n'est renvoyé au backend pour attribuer de l'XP.
 */
export type Progress = {
  level: number;
  currentXp: number;
  streakDays: number;
};

type UserState = {
  session: Session | null;
  profile: Profile | null;
  progress: Progress | null;
  /** Faux tant que la session persistée n'a pas été relue au démarrage. */
  isHydrated: boolean;

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

  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setProgress: (progress) => set({ progress }),
  setHydrated: (isHydrated) => set({ isHydrated }),
  reset: () => set({ ...initialState, isHydrated: true }),
}));

/** L'utilisateur a une session valide. */
export const useIsAuthenticated = () => useUserStore((s) => s.session !== null);

/** L'onboarding est terminé quand une classe a été choisie. */
export const useHasChosenClass = () => useUserStore((s) => s.profile?.classId != null);
