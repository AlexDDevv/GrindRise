import { Queue } from 'bullmq';
import IORedis from 'ioredis';

import type { AppConfig } from '../../config/env.config';

/** Token d'injection : `null` quand `REDIS_URL` n'est pas configurée. */
export const NOTIFICATIONS_QUEUE = 'NOTIFICATIONS_QUEUE';

export type NotificationsQueue = Queue | null;

/** Ne dépend que des deux champs utiles : le module n'a rien à caster. */
export type QueueConfig = Pick<
  AppConfig,
  'redisUrl' | 'notificationsQueueName'
>;

export function createNotificationsQueue(
  config: QueueConfig,
): NotificationsQueue {
  if (!config.redisUrl) return null;

  // Réglages inverses de ceux du worker, et volontairement : le producteur
  // tourne dans une requête HTTP. Il doit échouer vite plutôt que de faire
  // attendre un utilisateur pendant que Redis est injoignable — l'appel est
  // best-effort de toute façon.
  const connection = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  // Sans ce gestionnaire, une panne Redis fait tomber le process Node entier
  // sur un événement `error` non écouté.
  connection.on('error', () => undefined);

  return new Queue(config.notificationsQueueName, { connection });
}
