import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Ouvre une route aux appelants non authentifiés.
 *
 * `SupabaseAuthGuard` est enregistré globalement : tout endpoint est protégé
 * tant qu'il ne porte pas ce décorateur. C'est le même parti pris que la RLS
 * de la base — deny-by-default — et pour la même raison : un endpoint ajouté
 * plus tard sans y penser doit être fermé, pas ouvert.
 *
 * Chaque usage doit dire par quoi la route est protégée à la place. Deux cas
 * aujourd'hui : la sonde de vie du container (appelée sans identité) et le
 * webhook RevenueCat (authentifié par secret partagé).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
