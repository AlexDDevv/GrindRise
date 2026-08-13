import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Brouillon d'onboarding : ce que le joueur a choisi avant d'avoir un compte.
 *
 * L'ordre du parcours l'impose. Le sport et la classe se choisissent avant
 * l'authentification, or `profiles` n'existe qu'après elle — le trigger
 * `handle_new_user` crée la ligne à l'insertion dans `auth.users`. Il faut donc
 * un endroit pour tenir ces deux choix entre le moment où ils sont faits et
 * celui où ils peuvent s'écrire.
 *
 * **Persisté, et c'est le point important** : demander un code par email fait
 * quitter l'app pour aller le lire. Android peut tuer le processus pendant ce
 * temps. Sans persistance, revenir avec son code ferait recommencer le choix de
 * classe — juste après avoir lu quatre lores et tranché.
 *
 * `sportId` survit à l'onboarding, `classId` non : la classe part en base
 * (`profiles.class_id`), le sport n'a aucune colonne qui l'accueille. Il reste
 * donc ici, où il sert à présélectionner le formulaire de log. Voir la note
 * d'écart du récap : c'est une préférence d'appareil, pas une donnée de compte,
 * et elle ne suit pas le joueur d'un téléphone à l'autre.
 */

type OnboardingState = {
  /** Sport de prédilection. Null tant que l'étape n'est pas passée. */
  sportId: string | null;
  /** Classe choisie, en attente d'écriture dans `profiles`. */
  classId: string | null;
  /** Faux tant que le brouillon persisté n'a pas été relu au démarrage. */
  isHydrated: boolean;

  chooseSport: (sportId: string) => void;
  chooseClass: (classId: string) => void;
  /** Après écriture en base : la classe n'est plus un brouillon. */
  clearClassDraft: () => void;
  setHydrated: () => void;
};

/**
 * Nul si `AsyncStorage` n'est pas là — `createJSONStorage` avale alors
 * l'exception et rend `undefined`. Le cas est capturé plutôt qu'ignoré : sans
 * stockage, `persist` ne tente aucune réhydratation, donc n'appelle jamais
 * `onRehydrateStorage`, et l'app resterait sur son indicateur de démarrage
 * indéfiniment. Un brouillon non persisté est un désagrément ; un écran de
 * chargement sans fin est une app morte.
 */
const draftStorage = createJSONStorage(() => AsyncStorage);

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      sportId: null,
      classId: null,
      isHydrated: false,

      chooseSport: (sportId) => set({ sportId }),
      chooseClass: (classId) => set({ classId }),
      clearClassDraft: () => set({ classId: null }),
      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: 'grindrise.onboarding',
      storage: draftStorage,
      // `isHydrated` décrit l'état du chargement, pas le choix du joueur : le
      // persister le rendrait vrai avant même sa relecture.
      partialize: ({ sportId, classId }) => ({ sportId, classId }),
      // Le drapeau est posé même quand la relecture échoue : un brouillon perdu
      // fait recommencer deux écrans, un drapeau jamais levé bloque l'app sur
      // son indicateur de chargement.
      onRehydrateStorage: () => () => useOnboardingStore.getState().setHydrated(),
    },
  ),
);

if (!draftStorage) {
  console.warn(
    '[onboarding] AsyncStorage indisponible : le brouillon ne survivra pas à un ' +
      'redémarrage de l’app.',
  );
  useOnboardingStore.getState().setHydrated();
}
