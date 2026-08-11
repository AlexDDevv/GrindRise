import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../auth/authenticated-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { NarrativeService, type NarrativeState } from './narrative.service';

@Controller('narrative')
export class NarrativeController {
  constructor(private readonly narrative: NarrativeService) {}

  /**
   * État narratif de l'utilisateur authentifié, groupé par trame.
   *
   * Seuls les beats débloqués sont renvoyés : la table est en lecture publique
   * (comme les autres tables de contenu), mais l'API, elle, ne sert jamais un
   * texte non gagné.
   *
   * Aucun identifiant en paramètre, ici non plus : la cible est toujours le
   * `sub` du JWT vérifié.
   */
  @Get()
  getState(@CurrentUser() user: AuthenticatedUser): Promise<NarrativeState> {
    return this.narrative.getState(user.id);
  }

  /**
   * Marque un fragment comme lu : il ne sera plus présenté en popup.
   *
   * `POST` plutôt que `PATCH` : le client ne choisit pas la valeur écrite, il
   * déclenche un événement daté côté serveur. Rejouer l'appel est sans effet,
   * seule la première consultation est retenue.
   */
  @Post('beats/:beatId/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('beatId', ParseUUIDPipe) beatId: string,
  ): Promise<unknown> {
    return this.narrative.markBeatRead(user.id, beatId);
  }
}
