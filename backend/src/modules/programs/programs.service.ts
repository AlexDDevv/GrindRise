import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { Database } from '../../database.types';
import { SupabaseService } from '../../supabase/supabase.service';
import type {
  CreateProgramDto,
  CreateProgramWorkoutDto,
  RenameDto,
  ReplaceExercisesDto,
} from './dto/program.dto';

export type Program = Database['public']['Tables']['programs']['Row'];
export type ProgramWorkout =
  Database['public']['Tables']['program_workouts']['Row'];

const UNIQUE_VIOLATION = '23505';
const INVALID_EXERCISE = 'GR002';
const FOREIGN_RESOURCE = 'GR003';

/** Jour imbriqué dans la réponse de `list()`, avec ses exercices ordonnés. */
type NestedWorkout = ProgramWorkout & {
  program_workout_exercises?: { order_index: number }[] | null;
};

/** Programme imbriqué dans la réponse de `list()`. */
type NestedProgram = Program & { program_workouts?: NestedWorkout[] | null };

/**
 * Programmes d'entraînement et jours types.
 *
 * Ils n'ont aucune valeur de jeu — un programme ne rapporte pas d'XP — donc la
 * RLS autorise le mobile à les lire et à les écrire en direct. Ces endpoints
 * existent quand même, pour porter ce que la RLS ne sait pas exprimer : le
 * rang contigu des jours, et le remplacement atomique d'une liste d'exercices.
 *
 * L'API utilisant la clé `service_role`, qui contourne la RLS, chaque méthode
 * filtre l'appartenance explicitement. Une ressource d'un autre profil répond
 * 404 et jamais 403 : un 403 confirmerait que l'identifiant existe.
 */
@Injectable()
export class ProgramsService {
  private readonly logger = new Logger(ProgramsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /** Programmes de l'appelant, jours et exercices imbriqués et ordonnés. */
  async list(profileId: string): Promise<Program[]> {
    // PostgREST sait ordonner une table référencée directe via
    // `referencedTable: 'program_workouts'`, mais l'imbrication à deux
    // niveaux (`program_workouts.program_workout_exercises`) n'est pas une
    // syntaxe garantie par supabase-js. Les listes restant petites (moins de
    // 30 exercices par jour), on trie les exercices en mémoire après lecture
    // plutôt que de s'appuyer dessus.
    const { data, error } = await this.supabase.client
      .from('programs')
      .select(
        '*, program_workouts(*, program_workout_exercises(*, exercises(*)))',
      )
      .eq('profile_id', profileId)
      .order('created_at', { ascending: true })
      .order('order_index', {
        referencedTable: 'program_workouts',
        ascending: true,
      });

    if (error) {
      this.logger.error(
        `Lecture des programmes échouée pour ${profileId} : ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Impossible de lire les programmes.',
      );
    }

    const programs = (data ?? []) as unknown as NestedProgram[];
    for (const program of programs) {
      for (const workout of program.program_workouts ?? []) {
        workout.program_workout_exercises =
          workout.program_workout_exercises
            ?.slice()
            .sort((a, b) => a.order_index - b.order_index) ?? null;
      }
    }

    return programs as unknown as Program[];
  }

  async create(profileId: string, input: CreateProgramDto): Promise<Program> {
    const { data, error } = await this.supabase.client
      .from('programs')
      .insert({
        profile_id: profileId,
        sport_id: input.sportId,
        name: input.name,
      })
      .select()
      .single();

    if (error) {
      // Violation de clé étrangère : le sport n'existe pas. Faute du client.
      if (error.code === '23503') {
        throw new BadRequestException(`Sport inconnu : ${input.sportId}.`);
      }

      this.logger.error(
        `Création de programme échouée pour ${profileId} : ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Impossible de créer ce programme.',
      );
    }

    return data;
  }

  async rename(
    profileId: string,
    programId: string,
    input: RenameDto,
  ): Promise<Program> {
    const { data, error } = await this.supabase.client
      .from('programs')
      .update({ name: input.name })
      .eq('id', programId)
      // Le filtre d'appartenance est dans la requête d'écriture elle-même :
      // vérifier puis écrire laisserait une fenêtre entre les deux.
      .eq('profile_id', profileId)
      .select()
      .maybeSingle();

    if (error) {
      this.logger.error(`Renommage de programme échoué : ${error.message}`);
      throw new InternalServerErrorException(
        'Impossible de renommer ce programme.',
      );
    }

    // Un UPDATE qui ne touche rien réussit à vide : « pas d'erreur » ne vaut
    // pas « écrit ».
    if (!data) throw new NotFoundException('Ce programme est introuvable.');

    return data;
  }

  async remove(profileId: string, programId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('programs')
      .delete()
      .eq('id', programId)
      .eq('profile_id', profileId)
      .select('id')
      .maybeSingle();

    if (error) {
      this.logger.error(`Suppression de programme échouée : ${error.message}`);
      throw new InternalServerErrorException(
        'Impossible de supprimer ce programme.',
      );
    }

    if (!data) throw new NotFoundException('Ce programme est introuvable.');
  }

  /** Ajoute un jour en fin de programme. */
  async addWorkout(
    profileId: string,
    programId: string,
    input: CreateProgramWorkoutDto,
  ): Promise<ProgramWorkout> {
    await this.assertOwnsProgram(profileId, programId);

    const { data: last, error: readError } = await this.supabase.client
      .from('program_workouts')
      .select('order_index')
      .eq('program_id', programId)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (readError) {
      this.logger.error(`Lecture des jours échouée : ${readError.message}`);
      throw new InternalServerErrorException(
        'Impossible d’ajouter ce jour.',
      );
    }

    const { data, error } = await this.supabase.client
      .from('program_workouts')
      .insert({
        program_id: programId,
        name: input.name,
        order_index: (last?.order_index ?? -1) + 1,
      })
      .select()
      .single();

    if (error) {
      // Deux ajouts simultanés sur le même programme visent le même rang.
      // Cas rare (un utilisateur, deux écrans) et sans perte : réessayer suffit.
      if (error.code === UNIQUE_VIOLATION) {
        throw new ConflictException(
          'Un autre ajout vient d’avoir lieu, réessayez.',
        );
      }

      this.logger.error(`Ajout de jour échoué : ${error.message}`);
      throw new InternalServerErrorException('Impossible d’ajouter ce jour.');
    }

    return data;
  }

  async renameWorkout(
    profileId: string,
    workoutId: string,
    input: RenameDto,
  ): Promise<ProgramWorkout> {
    await this.assertOwnsWorkout(profileId, workoutId);

    const { data, error } = await this.supabase.client
      .from('program_workouts')
      .update({ name: input.name })
      .eq('id', workoutId)
      .select()
      .maybeSingle();

    if (error) {
      this.logger.error(`Renommage de jour échoué : ${error.message}`);
      throw new InternalServerErrorException(
        'Impossible de renommer ce jour.',
      );
    }

    if (!data) throw new NotFoundException('Ce jour est introuvable.');

    return data;
  }

  async removeWorkout(profileId: string, workoutId: string): Promise<void> {
    await this.assertOwnsWorkout(profileId, workoutId);

    const { error } = await this.supabase.client
      .from('program_workouts')
      .delete()
      .eq('id', workoutId);

    if (error) {
      this.logger.error(`Suppression de jour échouée : ${error.message}`);
      throw new InternalServerErrorException(
        'Impossible de supprimer ce jour.',
      );
    }
  }

  /**
   * Remplace la liste ordonnée d'exercices d'un jour, en une transaction.
   *
   * Par RPC parce que PostgREST ne sait pas enchaîner un delete et un insert
   * dans une transaction : un échec entre les deux laisserait le jour vide.
   */
  async replaceExercises(
    profileId: string,
    workoutId: string,
    input: ReplaceExercisesDto,
  ): Promise<unknown> {
    await this.assertOwnsWorkout(profileId, workoutId);

    const { data, error } = await this.supabase.client.rpc(
      'replace_program_workout_exercises',
      {
        p_profile_id: profileId,
        p_program_workout_id: workoutId,
        p_exercise_ids: input.exerciseIds,
      },
    );

    if (error) {
      if (error.code === INVALID_EXERCISE) {
        throw new BadRequestException(
          'Un des exercices est inconnu ou ne vous appartient pas.',
        );
      }

      if (error.code === FOREIGN_RESOURCE) {
        throw new NotFoundException('Ce jour est introuvable.');
      }

      this.logger.error(
        `Remplacement des exercices échoué pour ${profileId} : ${error.message}`,
      );
      throw new InternalServerErrorException(
        'Impossible de modifier ce jour.',
      );
    }

    return data;
  }

  private async assertOwnsProgram(
    profileId: string,
    programId: string,
  ): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('programs')
      .select('id')
      .eq('id', programId)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (error) {
      this.logger.error(`Vérification de programme échouée : ${error.message}`);
      throw new InternalServerErrorException(
        'Impossible de lire ce programme.',
      );
    }

    if (!data) throw new NotFoundException('Ce programme est introuvable.');
  }

  /**
   * `programs!inner` force la jointure : sans le `!inner`, PostgREST renverrait
   * le jour avec un parent nul plutôt que de le filtrer, et l'appartenance ne
   * serait pas vérifiée.
   */
  private async assertOwnsWorkout(
    profileId: string,
    workoutId: string,
  ): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('program_workouts')
      .select('id, programs!inner(profile_id)')
      .eq('id', workoutId)
      .eq('programs.profile_id', profileId)
      .maybeSingle();

    if (error) {
      this.logger.error(`Vérification de jour échouée : ${error.message}`);
      throw new InternalServerErrorException('Impossible de lire ce jour.');
    }

    if (!data) throw new NotFoundException('Ce jour est introuvable.');
  }
}
