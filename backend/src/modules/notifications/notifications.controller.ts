import {
  Controller,
  Get,
  Header,
  HttpStatus,
  Post,
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
   * Désabonnement depuis le lien en pied de l'email.
   *
   * `@Public()` : la route n'est pas ouverte, elle est protégée autrement — par
   * la signature du jeton, vérifiée dans le service. Exiger un JWT Supabase
   * imposerait de se connecter pour se désabonner, ce qui reviendrait à rendre
   * le désabonnement difficile — exactement ce que la réglementation interdit.
   *
   * **`GET` qui écrit, en connaissance de cause.** Certains antivirus et
   * passerelles de messagerie visitent les liens d'un message avant de le
   * livrer : un tel robot peut donc désabonner quelqu'un qui n'a rien cliqué.
   * La parade classique — afficher un bouton qui `POST`e — ajoute un clic à une
   * action qu'on doit rendre facile, pour un dégât borné : rien n'est perdu, et
   * la RLS autorise déjà le propriétaire à rebasculer la colonne depuis l'app.
   * À rouvrir si des désabonnements fantômes apparaissent.
   */
  @Public()
  @Get('unsubscribe')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  unsubscribe(
    @Query('token') token: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    return this.applyUnsubscribe(token, response);
  }

  /**
   * Même action, en `POST` : le désabonnement en un clic de la RFC 8058.
   *
   * C'est le bouton « Se désabonner » que le client mail affiche lui-même, en
   * haut du message, sur la foi de l'en-tête `List-Unsubscribe-Post` posé par
   * le worker. La RFC exige que ce `POST` agisse immédiatement, sans page
   * intermédiaire ni confirmation — ce que fait ce contrôleur.
   *
   * Il existe donc pour tenir cette promesse : annoncer l'en-tête sans exposer
   * la route donnerait un bouton qui échoue en silence, pire que pas de bouton.
   *
   * Le corps envoyé par le client mail (`List-Unsubscribe=One-Click`) n'est pas
   * lu : le jeton est dans l'URL, et déclarer un `@Body()` ferait passer ce
   * corps par le `ValidationPipe`, qui le rejetterait en `forbidNonWhitelisted`.
   *
   * Aucun risque de CSRF malgré l'écriture : la route n'accepte aucune
   * identité d'ambiance — ni cookie, ni session — seulement un jeton signé
   * qu'une page tierce ne peut pas fabriquer.
   */
  @Public()
  @Post('unsubscribe')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  unsubscribeOneClick(
    @Query('token') token: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    return this.applyUnsubscribe(token, response);
  }

  /**
   * @param response `passthrough` : le code de statut se règle à la main, mais
   * le corps reste renvoyé par NestJS. Sans lui, il faudrait écrire la réponse
   * soi-même et les décorateurs `@Header` seraient ignorés. C'est aussi ce qui
   * ramène le `POST` de 201 à 200.
   */
  private async applyUnsubscribe(
    token: string | undefined,
    response: Response,
  ): Promise<string> {
    const outcome = await this.notifications.unsubscribeFromLevelUp(
      token ?? '',
    );

    response.status(STATUS[outcome]);
    return renderUnsubscribePage(outcome);
  }
}
