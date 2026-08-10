import { Controller, Get, NotImplementedException } from '@nestjs/common';

@Controller('gamification')
export class GamificationController {
  /**
   * Progression de l'utilisateur authentifié (niveau, XP, palier suivant).
   * Lecture seule — aucune route n'accepte d'XP en entrée, par conception.
   */
  @Get('progress')
  getProgress(): unknown {
    throw new NotImplementedException();
  }
}
