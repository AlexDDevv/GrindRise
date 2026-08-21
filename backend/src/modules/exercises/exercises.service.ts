import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import type { Database } from '../../database.types';
import { SupabaseService } from '../../supabase/supabase.service';
import type { CreateExerciseDto } from './dto/create-exercise.dto';
import type { ListExercisesQuery } from './dto/list-exercises.query';

export type Exercise = Database['public']['Tables']['exercises']['Row'];

/** `unique_violation` : deux exercices custom de même nom pour un profil. */
const UNIQUE_VIOLATION = '23505';

/**
 * Catalogue d'exercices.
 *
 * Un exercice à `created_by` nul est prédéfini par l'app et visible de tous ;
 * les autres sont privés à leur auteur. Cette visibilité est écrite deux fois,
 * et il le faut : une policy RLS pour les lectures directes du mobile, et le
 * filtre de `list()` ci-dessous pour l'API — qui utilise la clé `service_role`
 * et contourne donc la RLS. L'oublier ici exposerait le catalogue privé de
 * tous les utilisateurs.
 */
@Injectable()
export class ExercisesService {
  private readonly logger = new Logger(ExercisesService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * @param profileId identité issue du JWT vérifié, jamais du corps de requête.
   */
  async list(
    profileId: string,
    filters: ListExercisesQuery,
  ): Promise<Exercise[]> {
    let query = this.supabase.client
      .from('exercises')
      .select('*')
      .or(`created_by.is.null,created_by.eq.${profileId}`);

    if (filters.muscleGroup) {
      query = query.eq('muscle_group', filters.muscleGroup);
    }

    if (filters.search) {
      // `%` et `_` sont les jokers de LIKE : sans échappement, une recherche
      // sur « % » ramènerait tout le catalogue. `*` aussi : PostgREST le
      // traite comme un alias de `%` dans ses opérateurs `like`/`ilike`, donc
      // une recherche sur « * » ramènerait tout le catalogue elle aussi.
      const motif = filters.search.replace(/[%_*\\]/g, '\\$&');
      query = query.ilike('name', `%${motif}%`);
    }

    // Les prédéfinis d'abord, puis les customs, chaque groupe par nom : le
    // catalogue de base est ce qu'on cherche dans la grande majorité des cas.
    const { data, error } = await query
      .order('created_by', { ascending: true, nullsFirst: true })
      .order('name', { ascending: true });

    if (error) {
      this.logger.error(`Lecture du catalogue échouée : ${error.message}`);
      throw new InternalServerErrorException(
        'Impossible de lire le catalogue d’exercices.',
      );
    }

    return data ?? [];
  }

  async create(profileId: string, input: CreateExerciseDto): Promise<Exercise> {
    const { data, error } = await this.supabase.client
      .from('exercises')
      .insert({
        name: input.name,
        muscle_group: input.muscleGroup,
        // Jamais lu dans le corps : un `created_by` nul ferait un exercice
        // prédéfini, visible de tous.
        created_by: profileId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        throw new ConflictException('Vous avez déjà un exercice de ce nom.');
      }

      this.logger.error(
        `Création d’exercice échouée pour ${profileId} : ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Impossible de créer cet exercice.',
      );
    }

    return data;
  }
}
