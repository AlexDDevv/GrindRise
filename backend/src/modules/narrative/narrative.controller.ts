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
import {
  NarrativeService,
  type NarrativeBeat,
  type NarrativeState,
} from './narrative.service';

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
   * Rattrape les déblocages en retard, sans renvoyer tout le codex.
   *
   * Existe pour les moments de progression qui ne passent pas par une séance —
   * aujourd'hui la sortie de l'onboarding, où le premier fragment doit être
   * disponible dès la création du compte plutôt qu'à la première séance loggée.
   *
   * Il n'y avait pas de bon endroit ailleurs : le choix de classe s'écrit
   * directement en base par la RLS, et un trigger Postgres aurait fait entrer
   * les seuils de déblocage dans la base, là où tout le reste du game design
   * vit en TypeScript.
   *
   * À ne pas lire comme « l'onboarding débloque du contenu parce qu'une classe
   * a été choisie » : la classe n'entre pas dans le calcul, c'est le seul moment
   * du parcours où le compte devient utilisable.
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async sync(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ unlocked: NarrativeBeat[] }> {
    return { unlocked: await this.narrative.syncUnlocks(user.id) };
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
