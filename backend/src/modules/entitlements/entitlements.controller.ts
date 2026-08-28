import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  NotImplementedException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Public } from '../../auth/public.decorator';
import type { AppConfig } from '../../config/env.config';
import { isAuthorized, readEvent } from './contract';
import { EntitlementsService } from './entitlements.service';

@Controller('webhooks')
export class EntitlementsController {
  private readonly logger = new Logger(EntitlementsController.name);

  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Webhook RevenueCat.
   *
   * `@Public()` : l'appelant est RevenueCat, pas un utilisateur — il n'a aucun
   * JWT Supabase à présenter. La route n'est donc pas ouverte, elle est
   * protégée autrement, par le secret partagé.
   *
   * Trois refus, et ils ne se ressemblent pas :
   *
   * - **501, secret non configuré.** L'endpoint refuse d'exister plutôt que de
   *   s'ouvrir : une route qui écrit les droits payants sans rien vérifier est
   *   pire qu'une route absente ;
   * - **401, signature fausse.** RevenueCat rejouera, ce qui est sans effet —
   *   mais un appelant qui n'a pas le secret n'est pas RevenueCat ;
   * - **200 sans écriture, corps illisible ou type inconnu.** Aucun rejeu ne
   *   réparera un événement malformé. Répondre autre chose ferait boucler
   *   RevenueCat jusqu'à l'abandon, en masquant les vrais incidents.
   */
  @Public()
  @Post('revenuecat')
  @HttpCode(200)
  async handleRevenueCat(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ): Promise<{ received: true }> {
    const secret = this.config.get('revenuecatWebhookSecret', { infer: true });

    if (!secret) {
      throw new NotImplementedException(
        'Webhook RevenueCat non configuré (REVENUECAT_WEBHOOK_SECRET).',
      );
    }

    if (!isAuthorized(authorization, secret)) {
      // Jamais la valeur présentée : la journaliser reviendrait à conserver un
      // candidat de force brute en clair dans les logs. Sans limite de débit
      // ailleurs dans l'API, ce endpoint est le seul qu'un inconnu peut
      // marteler contre un secret partagé, et ça ne laissait aujourd'hui
      // aucune trace.
      this.logger.warn('Webhook RevenueCat refusé : signature invalide.');
      throw new UnauthorizedException();
    }

    const event = readEvent(body);

    if (!event) {
      this.logger.warn(
        'Webhook RevenueCat au corps illisible — ignoré, aucun rejeu utile.',
      );
      return { received: true };
    }

    await this.entitlements.applyRevenueCatEvent(event);

    return { received: true };
  }
}
