import {
  Controller,
  HttpCode,
  NotImplementedException,
  Post,
} from '@nestjs/common';

@Controller('webhooks')
export class EntitlementsController {
  /**
   * Webhook RevenueCat.
   *
   * À implémenter avant toute mise en prod :
   * 1. vérifier l'en-tête `Authorization` contre `REVENUECAT_WEBHOOK_SECRET`
   *    (secret partagé configuré dans le dashboard RevenueCat) ;
   * 2. router selon `event.type` (INITIAL_PURCHASE, RENEWAL, CANCELLATION,
   *    EXPIRATION, NON_RENEWING_PURCHASE pour le lifetime…) ;
   * 3. mettre à jour `entitlements` de façon idempotente ;
   * 4. répondre 200 rapidement — RevenueCat rejoue sur toute autre réponse.
   */
  @Post('revenuecat')
  @HttpCode(200)
  handleRevenueCat(): unknown {
    throw new NotImplementedException();
  }
}
