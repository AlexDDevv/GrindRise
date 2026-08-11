import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { Database } from '../../database.types';
import { SupabaseService } from '../../supabase/supabase.service';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type UserProgress = Database['public']['Tables']['user_progress']['Row'];

/**
 * Le profil et sa progression sont renvoyés séparément plutôt qu'imbriqués :
 * `user_progress` est un cache recalculable, pas un attribut du profil, et
 * les deux n'ont pas la même durée de vie côté client.
 */
export type UserWithProgress = {
  profile: Profile;
  /** Nul si le trigger de création n'a pas encore posé la ligne. */
  progress: UserProgress | null;
};

/**
 * Profils utilisateurs (`profiles`).
 *
 * La lecture/écriture simple de son propre profil se fait directement depuis
 * le mobile via la RLS. Ce service ne sert qu'aux opérations qui dépassent ce
 * cadre — ici, servir de première preuve que la garde d'authentification tient.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * @param profileId identité issue du JWT vérifié, jamais du corps de requête.
   */
  async getProfile(profileId: string): Promise<UserWithProgress> {
    // Une seule requête plutôt que deux : la relation est 1-pour-1
    // (`user_progress.profile_id` est à la fois PK et FK), donc PostgREST
    // renvoie un objet et non un tableau.
    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('*, user_progress(*)')
      .eq('id', profileId)
      .maybeSingle();

    if (error) {
      // `maybeSingle` ne considère pas l'absence de ligne comme une erreur :
      // arriver ici signifie une vraie panne (réseau, schéma), pas un 404.
      this.logger.error(
        `Lecture du profil ${profileId} échouée : ${error.message}`,
      );
      throw new InternalServerErrorException('Lecture du profil impossible.');
    }

    if (!data) {
      // Le client service_role contourne la RLS : une ligne absente ici est
      // réellement absente, ce n'est pas un filtrage de policy.
      throw new NotFoundException("Ce compte n'a pas de profil associé.");
    }

    const { user_progress: progress, ...profile } = data;
    return { profile, progress };
  }
}
