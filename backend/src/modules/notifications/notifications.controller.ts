import {
  Controller,
  Get,
  Header,
  HttpStatus,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../../auth/public.decorator';
import { NotificationsService } from './notifications.service';
import {
  renderUnsubscribePage,
  type UnsubscribeOutcome,
} from './unsubscribe-page';

/** Code HTTP servi avec la page, selon l'issue. */
const STATUS: Record<UnsubscribeOutcome, number> = {
  desabonne: HttpStatus.OK,
  'lien-invalide': HttpStatus.BAD_REQUEST,
  indisponible: HttpStatus.SERVICE_UNAVAILABLE,
};

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /**
   * Désabonnement des emails de palier, depuis le lien d'un email.
   *
   * `@Public()` : la route n'est pas ouverte, elle est protégée autrement — par
   * la signature du jeton, vérifiée dans le service. Exiger un JWT Supabase
   * imposerait de se connecter pour se désabonner, ce qui reviendrait à rendre
   * le désabonnement difficile — exactement ce que la réglementation interdit.
   *
   * **`GET` qui écrit, en connaissance de cause.** Certains antivirus et
   * passerelles de messagerie visitent les liens d'un message avant de le
   * livrer : un tel robot peut donc désabonner quelqu'un qui n'a rien cliqué.
   * La parade classique — afficher un bouton qui `POST`e — ajoute un clic à
   * une action qu'on doit rendre facile, pour un dégât nul : la préférence se
   * remet à vrai depuis les réglages de l'app, et aucune donnée n'est perdue.
   * À rouvrir seulement si des désabonnements fantômes apparaissent.
   *
   * `Cache-Control: no-store` : sans lui, un proxy ou le navigateur pourrait
   * resservir cette page — donc l'annonce d'un désabonnement — à un autre
   * moment, sans que la requête atteigne jamais l'API.
   */
  @Public()
  @Get('unsubscribe')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async unsubscribe(
    @Query('token') token: string | undefined,
    // `passthrough` : le code de statut se règle à la main, mais le corps
    // reste renvoyé par NestJS. Sans lui, il faudrait écrire la réponse
    // soi-même et les décorateurs `@Header` ci-dessus seraient ignorés.
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const outcome = await this.notifications.unsubscribeFromLevelUp(
      token ?? '',
    );

    response.status(STATUS[outcome]);
    return renderUnsubscribePage(outcome);
  }
}
