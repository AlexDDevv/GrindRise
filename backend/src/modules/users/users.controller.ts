import { Controller, Get, NotImplementedException } from '@nestjs/common';

@Controller('users')
export class UsersController {
  /** Profil de l'utilisateur authentifié (garde d'auth à ajouter). */
  @Get('me')
  getMe(): unknown {
    throw new NotImplementedException();
  }
}
