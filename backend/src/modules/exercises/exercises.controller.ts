import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import type { AuthenticatedUser } from '../../auth/authenticated-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { ListExercisesQuery } from './dto/list-exercises.query';
import { ExercisesService, type Exercise } from './exercises.service';

@Controller('exercises')
export class ExercisesController {
  constructor(private readonly exercises: ExercisesService) {}

  /** Les prédéfinis de l'app plus les exercices créés par l'appelant. */
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListExercisesQuery,
  ): Promise<Exercise[]> {
    return this.exercises.list(user.id, query);
  }

  /**
   * L'auteur vient du jeton, jamais du corps : un `createdBy` envoyé fait
   * échouer la requête en 400 via `forbidNonWhitelisted`.
   */
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateExerciseDto,
  ): Promise<Exercise> {
    return this.exercises.create(user.id, body);
  }
}
