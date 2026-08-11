import {
  createParamDecorator,
  InternalServerErrorException,
  type ExecutionContext,
} from '@nestjs/common';

import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from './authenticated-user';

/**
 * Injecte l'utilisateur authentifié dans un handler.
 *
 * ```ts
 * @Get('me')
 * getMe(@CurrentUser() user: AuthenticatedUser) {
 *   return this.users.getProfile(user.id); // user.id EST le profile_id
 * }
 * ```
 *
 * Le type de retour n'est jamais nullable : sur une route protégée, le guard
 * a déjà rejeté la requête en 401 si le jeton était absent ou invalide.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      // Seul chemin possible : le décorateur a été posé sur une route
      // `@Public()`, où le guard n'a rien renseigné. C'est un bug de code, pas
      // une requête mal formée — d'où un 500 explicite plutôt qu'un 401
      // trompeur qui enverrait l'appelant chercher un problème de jeton.
      throw new InternalServerErrorException(
        '@CurrentUser() utilisé sur une route @Public() : aucune identité vérifiée.',
      );
    }

    return request.user;
  },
);
