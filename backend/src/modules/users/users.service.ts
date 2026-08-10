import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Profils utilisateurs (`profiles`).
 *
 * La lecture/écriture simple de son propre profil peut se faire directement
 * depuis le mobile via la RLS. Ce service ne sert qu'aux opérations qui
 * dépassent ce cadre (agrégations, actions admin, création liée à l'auth).
 *
 * À l'implémentation : injecter `SupabaseService` (module global).
 */
@Injectable()
export class UsersService {
  getProfile(_profileId: string): Promise<unknown> {
    throw new NotImplementedException('UsersService.getProfile');
  }
}
