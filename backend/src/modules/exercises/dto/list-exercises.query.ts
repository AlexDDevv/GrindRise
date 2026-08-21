import { IsIn, IsOptional, IsString, Length } from 'class-validator';

import { MUSCLE_GROUPS, type MuscleGroup } from './create-exercise.dto';

export class ListExercisesQuery {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  search?: string;

  @IsOptional()
  @IsIn(MUSCLE_GROUPS)
  muscleGroup?: MuscleGroup;
}
