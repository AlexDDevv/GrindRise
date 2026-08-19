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
import type { UnsubscribeOutcome } from './unsubscribe-page';
import {
  UNSUBSCRIBE_LINKS,
  UnsubscribeLinks,
  type UnsubscribeLinksProvider,
} from './unsubscribe-links';

export type LevelUpInput = {
  username: string | null;
  levelBefore: number;
  levelAfter: number;
  /**
   * `profiles.notify_level_up` du destinataire.
   *
   * Passé par l'appelant plutôt que relu ici : celui-ci vient justement de
   * charger le profil pour en tirer le fuseau et le niveau précédent, la
   * relecture serait un aller-retour réseau ajouté au chemin d'une requête. Le
   * champ est obligatoire — le typage interdit d'oublier la vérification.
   */
  notifyLevelUp: boolean;
};

/**
 * Temps total accordé à la production d'une notification.
 *
 * Un `add` sain prend une vingtaine de millisecondes : deux secondes laissent
 * une marge large. Ce garde-temps ne double pas la gestion d'erreur, il couvre
 * le cas qu'elle ne voit pas — l'attente. `maxRetriesPerRequest` et
 * `enableOfflineQueue` ne bornent que les commandes d'une connexion DÉJÀ
 * établie ; Redis jamais joignable (un mot de passe mal recopié suffit) et
 * BullMQ attend indéfiniment que la connexion soit « prête » avant d'empiler.
 */
const ENQUEUE_DEADLINE_MS = 2_000;

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
    @Inject(UNSUBSCRIBE_LINKS)
    private readonly unsubscribeLinks: UnsubscribeLinksProvider,
    private readonly supabase: SupabaseService,
  ) {
    if (!this.queue) {
      this.logger.warn(
        'REDIS_URL absente : aucune notification ne sera produite. ' +
          'Voir .env.example.',
      );
    }
  }

  /**
   * Produit la notification sans jamais retenir la requête HTTP appelante.
   *
   * Le garde-temps couvre toute la méthode, lecture de l'email comprise :
   * `getUserById` est lui aussi un appel réseau awaité dans le chemin de la
   * requête, et `fetch` n'a pas de délai d'expiration par défaut. Une échéance
   * unique borne ce que l'API ajoute à la requête d'un joueur, quel que soit
   * l'appel qui pend.
   *
   * L'appel étant best-effort par conception, abandonner est le comportement
   * correct : on journalise et on rend la main.
   */
  async enqueueLevelUp(profileId: string, input: LevelUpInput): Promise<void> {
    const queue = this.queue;
    if (!queue) return;

    // Le refus se vérifie ici, pas dans le worker. Un job empilé est un job qui
    // finira par être traité — par une reprise, par un rejeu manuel depuis le
    // tableau de bord BullMQ — et donc un email qui partira quand même. Le seul
    // endroit où un email refusé ne peut pas repartir, c'est celui où il n'a
    // jamais existé.
    if (!input.notifyLevelUp) {
      this.logger.log(
        `Palier ${input.levelAfter} atteint par ${profileId}, ` +
          'désabonné des emails de palier : aucun job produit.',
      );
      return;
    }

    // Sans lien de désabonnement, l'email n'a pas le droit de partir : on ne
    // produit rien plutôt que d'envoyer un message non conforme. `validateEnv`
    // rend le cas impossible en production — REDIS_URL configurée y impose les
    // deux variables — il ne reste atteignable qu'en développement local.
    const links = this.unsubscribeLinks;
    if (!links) {
      this.logger.error(
        `Notification de palier ${input.levelAfter} non produite pour ` +
          `${profileId} : UNSUBSCRIBE_TOKEN_SECRET ou PUBLIC_API_URL manque, ` +
          'aucun lien de désabonnement ne peut être composé.',
      );
      return;
    }

    // Le travail est lancé puis le minuteur armé, sans `await` entre les deux :
    // l'échéance court donc bien depuis l'entrée dans la méthode.
    const work = this.produceLevelUp(queue, links, profileId, input);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<'expiré'>((resolve) => {
      timer = setTimeout(() => resolve('expiré'), ENQUEUE_DEADLINE_MS);
    });

    try {
      // Un rejet de `work` traverse cette course — une incohérence de payload
      // doit rester visible. Un rejet arrivant après l'échéance est absorbé
      // par la course elle-même, il ne remonte pas en `unhandledRejection`.
      const outcome = await Promise.race([
        work.then(() => 'produit' as const),
        deadline,
      ]);

      if (outcome === 'expiré') {
        this.logger.warn(
          `Notification de palier ${input.levelAfter} abandonnée pour ` +
            `${profileId} : rien produit en ${ENQUEUE_DEADLINE_MS} ms. ` +
            'Redis est-elle joignable, et REDIS_URL correcte ?',
        );
      }
    } finally {
      // Sans ça, un appel sain laisse un minuteur en vie deux secondes de plus.
      clearTimeout(timer);
    }
  }

  private async produceLevelUp(
    queue: NonNullable<NotificationsQueue>,
    links: UnsubscribeLinks,
    profileId: string,
    input: LevelUpInput,
  ): Promise<void> {
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
      unsubscribeUrl: links.urlFor(profileId),
    };

    // Le producteur valide son propre message, avec la fonction même dont se
    // sert le worker : une incohérence se voit ici plutôt que dans les logs
    // d'un autre service.
    assertLevelUpJob(payload);

    await queue.add(LEVEL_UP_JOB_NAME, payload, {
      ...LEVEL_UP_JOB_OPTIONS,
      // Déterministe : deux séances franchissant le même palier ne produisent
      // qu'un email, BullMQ ignorant un jobId déjà connu.
      jobId: levelUpJobId(profileId, input.levelAfter),
    });

    this.logger.log(
      `Notification de palier ${input.levelAfter} produite pour ${profileId}`,
    );
  }

  /**
   * Coupe les emails de palier pour le profil désigné par le jeton.
   *
   * Écrit avec la clé `service_role`, qui contourne la RLS — et il le faut :
   * le lien est cliqué depuis une boîte mail, sans session Supabase, il n'y a
   * aucun `auth.uid()` à opposer à `profiles_update_own`. La signature du
   * jeton remplace ici le JWT comme preuve d'identité, c'est tout le rôle de
   * `UnsubscribeLinks`.
   *
   * Idempotente : recliquer le même lien réécrit `false` sur `false` et
   * réussit. Un deuxième clic ne doit pas ressembler à une panne.
   *
   * Ne lève jamais. L'appelant est un humain devant un navigateur, à qui une
   * page lisible doit être servie quoi qu'il arrive — pas une erreur JSON de
   * NestJS.
   */
  async unsubscribeFromLevelUp(token: string): Promise<UnsubscribeOutcome> {
    const links = this.unsubscribeLinks;
    if (!links) {
      this.logger.error(
        'Désabonnement impossible : UNSUBSCRIBE_TOKEN_SECRET ou ' +
          'PUBLIC_API_URL manque, aucun jeton ne peut être vérifié.',
      );
      return 'indisponible';
    }

    const profileId = links.profileIdFrom(token);
    if (profileId === null) {
      // Ni le jeton ni sa longueur ne vont dans les logs : un lien reçu par
      // erreur n'a pas à laisser de trace exploitable.
      this.logger.warn('Désabonnement refusé : jeton illisible ou mal signé.');
      return 'lien-invalide';
    }

    const { data, error } = await this.supabase.client
      .from('profiles')
      .update({ notify_level_up: false })
      // Exiger la ligne en retour : un UPDATE qui ne touche rien réussit à
      // vide, « pas d'erreur » ne vaut pas « écrit ».
      .eq('id', profileId)
      .select('id')
      .maybeSingle();

    if (error) {
      this.logger.error(
        `Désabonnement échoué pour ${profileId} : ${error.message}`,
      );
      return 'indisponible';
    }

    if (!data) {
      // Jeton valide mais profil disparu : compte supprimé depuis l'envoi de
      // l'email. Il n'y a plus rien à désabonner, et rien à annoncer non plus.
      this.logger.warn(
        `Désabonnement sans effet : profil ${profileId} introuvable.`,
      );
      return 'lien-invalide';
    }

    this.logger.log(`Profil ${profileId} désabonné des emails de palier.`);
    return 'desabonne';
  }
}
