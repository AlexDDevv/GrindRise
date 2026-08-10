import { Controller, NotImplementedException, Post } from '@nestjs/common';

@Controller('workouts')
export class WorkoutsController {
  /**
   * Enregistre une séance. Le corps de requête ne contient jamais d'XP :
   * tout champ de ce genre serait ignoré (voir GamificationService).
   */
  @Post()
  create(): unknown {
    throw new NotImplementedException();
  }
}
