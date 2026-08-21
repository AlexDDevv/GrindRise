import { IsIn, IsString, Length } from 'class-validator';

import type { Database } from '../../../database.types';

export type MuscleGroup = Database['public']['Enums']['muscle_group'];

/**
 * Miroir de l'enum Postgres.
 *
 * `satisfies` fait échouer la compilation si une valeur écrite ici n'existe pas
 * en base — ce que `as const` seul ne verrait pas. Il ne détecte pas l'inverse
 * (une valeur de l'enum oubliée ici), mais ce cas se voit : le groupe manquant
 * ne serait tout simplement jamais proposé.
 */
export const MUSCLE_GROUPS = [
  'pectoraux',
  'dos',
  'epaules',
  'biceps',
  'triceps',
  'avant_bras',
  'quadriceps',
  'ischios',
  'fessiers',
  'mollets',
  'abdominaux',
  'full_body',
] as const satisfies readonly MuscleGroup[];

export class CreateExerciseDto {
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsIn(MUSCLE_GROUPS)
  muscleGroup!: MuscleGroup;
}

/**
 * Aucun `createdBy` ici, et c'est délibéré : l'auteur vient du JWT vérifié.
 * Un `createdBy` dans le corps permettrait de créer un exercice prédéfini
 * (`null`), donc visible de tous les utilisateurs de l'app. Le
 * `forbidNonWhitelisted` le rejette en 400.
 */
