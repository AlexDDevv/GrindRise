import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CreateProgramDto {
  /** Slug de `sports.id`. L'existence est vérifiée par la FK à l'insertion. */
  @IsString()
  @IsNotEmpty()
  sportId!: string;

  @IsString()
  @Length(1, 80)
  name!: string;
}

export class RenameDto {
  @IsString()
  @Length(1, 80)
  name!: string;
}

export class CreateProgramWorkoutDto {
  /** « Jour Push », « Jour Jambes »… */
  @IsString()
  @Length(1, 80)
  name!: string;
}

/**
 * La liste complète, pas un ajout.
 *
 * Un remplacement intégral plutôt qu'un trio ajouter/retirer/réordonner :
 * réordonner devient l'envoi d'un tableau, le serveur réattribue les rangs, et
 * il n'existe aucun état intermédiaire où deux exercices partagent un rang.
 * Une liste vide est un remplacement valide — c'est ainsi qu'on vide un jour.
 */
export class ReplaceExercisesDto {
  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID('4', { each: true })
  exerciseIds!: string[];
}
