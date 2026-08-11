import { Controller, Get } from '@nestjs/common';

import type { AuthenticatedUser } from '../../auth/authenticated-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { UsersService, type UserWithProgress } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * Profil et progression de l'utilisateur authentifié.
   *
   * Aucun identifiant n'est accepté en paramètre : la cible est toujours le
   * `sub` du JWT vérifié. C'est ce qui rend l'endpoint incapable de servir le
   * profil de quelqu'un d'autre, même à un appelant qui le demanderait.
   */
  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<UserWithProgress> {
    return this.users.getProfile(user.id);
  }
}
