import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../config/env.config';
import { SupabaseModule } from '../../supabase/supabase.module';
import { NotificationsController } from './notifications.controller';
import {
  NOTIFICATIONS_QUEUE,
  createNotificationsQueue,
  type NotificationsQueue,
} from './notifications.queue';
import { NotificationsService } from './notifications.service';
import {
  UNSUBSCRIBE_LINKS,
  createUnsubscribeLinks,
  type UnsubscribeLinksProvider,
} from './unsubscribe-links';

/**
 * Producteur, et rien d'autre : ce module ne consomme aucune queue. Le
 * traitement vit dans un service séparé (dépôt grindrise-notifications),
 * joignable uniquement par la queue.
 *
 * Son unique contrôleur ne dessert pas l'application mobile mais les emails
 * déjà partis : le lien de désabonnement qu'ils portent doit atterrir quelque
 * part, et cet endroit est ici, à côté du code qui décide de les envoyer.
 */
@Module({
  imports: [SupabaseModule],
  controllers: [NotificationsController],
  providers: [
    {
      provide: NOTIFICATIONS_QUEUE,
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<AppConfig, true>,
      ): NotificationsQueue =>
        createNotificationsQueue({
          redisUrl: config.get('redisUrl', { infer: true }),
          notificationsQueueName: config.get('notificationsQueueName', {
            infer: true,
          }),
        }),
    },
    {
      provide: UNSUBSCRIBE_LINKS,
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<AppConfig, true>,
      ): UnsubscribeLinksProvider =>
        createUnsubscribeLinks({
          unsubscribeTokenSecret: config.get('unsubscribeTokenSecret', {
            infer: true,
          }),
          publicApiUrl: config.get('publicApiUrl', { infer: true }),
        }),
    },
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
