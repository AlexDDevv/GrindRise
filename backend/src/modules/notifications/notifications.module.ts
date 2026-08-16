import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../config/env.config';
import { SupabaseModule } from '../../supabase/supabase.module';
import {
  NOTIFICATIONS_QUEUE,
  createNotificationsQueue,
  type NotificationsQueue,
} from './notifications.queue';
import { NotificationsService } from './notifications.service';

/**
 * Producteur seul : ce module n'expose aucun contrôleur et ne consomme rien.
 * Le traitement vit dans un service séparé (dépôt grindrise-notifications),
 * joignable uniquement par la queue.
 */
@Module({
  imports: [SupabaseModule],
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
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
