import { Body, Controller, Post } from '@nestjs/common';

import type { AuthenticatedUser } from '../../auth/authenticated-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { CreateWorkoutDto } from './dto/create-workout.dto';
import { WorkoutsService, type WorkoutCreated } from './workouts.service';

@Controller('workouts')
export class WorkoutsController {
  constructor(private readonly workouts: WorkoutsService) {}

  /**
   * Enregistre une séance et crédite l'XP qu'elle vaut.
   *
   * Le corps ne porte ni identité ni montant d'XP : le `profile_id` vient du
   * JWT vérifié, et l'XP est déduite de la séance par le serveur. Ces deux
   * champs ne sont pas ignorés s'ils sont envoyés — le `ValidationPipe` global
   * tourne en `forbidNonWhitelisted`, donc la requête échoue en 400.
   *
   * La réponse reprend la forme `{ profile, progress }` de `GET /users/me`
   * pour que le mobile n'ait qu'un contrat à connaître, augmentée d'un `award`
   * qui dit ce que la séance a rapporté.
   */
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateWorkoutDto,
  ): Promise<WorkoutCreated> {
    return this.workouts.createWorkoutLog(user.id, body);
  }
}
