import { Inject, Injectable, Logger } from '@nestjs/common';

import { SupabaseService } from '../../supabase/supabase.service';
import {
  LEVEL_UP_JOB_NAME,
  LEVEL_UP_JOB_OPTIONS,
  LEVEL_UP_JOB_VERSION,
  assertLevelUpJob,
  levelUpJobId,
  type LevelUpJob,
} from './contract';
import {
  NOTIFICATIONS_QUEUE,
  type NotificationsQueue,
} from './notifications.queue';

export type LevelUpInput = {
  username: string | null;
  levelBefore: number;
  levelAfter: number;
};

/**
 * Producteur de notifications — et rien d'autre.
 *
 * L'API ne connaît pas le worker : elle dépose un message dans une queue et
 * s'arrête là. Aucun appel HTTP, aucune attente de réponse.
 *
 * C'est ici qu'est résolue l'adresse email, pour que le payload soit
 * auto-suffisant et que le worker n'ait aucun accès à Supabase.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(NOTIFICATIONS_QUEUE) private readonly queue: NotificationsQueue,
    private readonly supabase: SupabaseService,
  ) {
    if (!this.queue) {
      this.logger.warn(
        'REDIS_URL absente : aucune notification ne sera produite. ' +
          'Voir .env.example.',
      );
    }
  }

  async enqueueLevelUp(profileId: string, input: LevelUpInput): Promise<void> {
    if (!this.queue) return;

    // L'email vit dans auth.users, pas dans profiles. Cet appel n'a lieu qu'à
    // une montée de niveau, jamais sur une séance ordinaire.
    const { data, error } =
      await this.supabase.client.auth.admin.getUserById(profileId);

    if (error || !data.user?.email) {
      this.logger.warn(
        `Aucune adresse email pour ${profileId} : notification abandonnée.`,
      );
      return;
    }

    const payload: LevelUpJob = {
      version: LEVEL_UP_JOB_VERSION,
      profileId,
      email: data.user.email,
      username: input.username,
      levelBefore: input.levelBefore,
      levelAfter: input.levelAfter,
      occurredAt: new Date().toISOString(),
    };

    // Le producteur valide son propre message, avec la fonction même dont se
    // sert le worker : une incohérence se voit ici plutôt que dans les logs
    // d'un autre service.
    assertLevelUpJob(payload);

    await this.queue.add(LEVEL_UP_JOB_NAME, payload, {
      ...LEVEL_UP_JOB_OPTIONS,
      // Déterministe : deux séances franchissant le même palier ne produisent
      // qu'un email, BullMQ ignorant un jobId déjà connu.
      jobId: levelUpJobId(profileId, input.levelAfter),
    });

    this.logger.log(
      `Notification de palier ${input.levelAfter} produite pour ${profileId}`,
    );
  }
}
