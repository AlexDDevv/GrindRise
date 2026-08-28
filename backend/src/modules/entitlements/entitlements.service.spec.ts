import type { PostgrestError } from '@supabase/supabase-js';

import { SupabaseService } from '../../supabase/supabase.service';
import type { RevenueCatEvent } from './contract';
import { EntitlementsService } from './entitlements.service';

const PROFIL = '3f8b1c2e-6d4a-4f1b-9c7e-2a5d8e0b4f16';

type LigneCourante = {
  plan: string;
  status: string;
  expires_at: string | null;
  last_event_at: string | null;
} | null;

/** Un appel au builder PostgREST, arguments compris. */
type Appel = { methode: string; args: unknown[] };

/**
 * Bouchonne Supabase et retient chaque appel avec ses arguments.
 *
 * Retenir les arguments n'est pas du zèle. Un bouchon qui rend le builder sans
 * rien noter laisse supprimer le `.eq('profile_id', …)` de la mise à jour sans
 * qu'aucun test ne bronche : PostgREST patcherait alors **toutes** les lignes
 * d'`entitlements`, et la plateforme entière deviendrait abonnée.
 *
 * `from()` rend un builder neuf à chaque appel, et c'est ce qui rend
 * l'assertion discriminante : la lecture et l'écriture filtrent toutes deux sur
 * `profile_id`, seule la séparation des deux chaînes permet d'exiger le filtre
 * sur celle qui écrit.
 */
/** Les pannes que le bouchon peut simuler, chacune sur sa requête. */
type Pannes = { lecture?: PostgrestError; ecriture?: PostgrestError };

function erreurPg(code: string, message: string, hint = ''): PostgrestError {
  return { name: 'PostgrestError', message, details: '', hint, code };
}

function stubSupabase(courante: LigneCourante, pannes: Pannes = {}) {
  const ecritures: Record<string, unknown>[] = [];
  const chaines: Appel[][] = [];

  function builder(): Record<string, unknown> {
    const appels: Appel[] = [];
    chaines.push(appels);

    const chaine: Record<string, unknown> = {};
    for (const methode of ['select', 'eq', 'or']) {
      chaine[methode] = (...args: unknown[]) => {
        appels.push({ methode, args });
        return chaine;
      };
    }
    chaine.maybeSingle = () => {
      appels.push({ methode: 'maybeSingle', args: [] });
      return Promise.resolve(
        pannes.lecture
          ? { data: null, error: pannes.lecture }
          : { data: courante, error: null },
      );
    };
    chaine.update = (valeurs: Record<string, unknown>) => {
      appels.push({ methode: 'update', args: [valeurs] });
      ecritures.push(valeurs);
      return chaine;
    };
    chaine.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: null, error: pannes.ecriture ?? null });

    return chaine;
  }

  const client = { from: () => builder() };

  /** La chaîne qui a écrit, par opposition à celle qui a lu. */
  const chaineEcriture = (): Appel[] =>
    chaines.find((appels) =>
      appels.some(({ methode }) => methode === 'update'),
    ) ?? [];

  /** La chaîne qui a lu l'état courant. */
  const chaineLecture = (): Appel[] =>
    chaines.find((appels) =>
      appels.some(({ methode }) => methode === 'maybeSingle'),
    ) ?? [];

  return {
    ecritures,
    chaineEcriture,
    chaineLecture,
    service: new EntitlementsService({ client } as unknown as SupabaseService),
  };
}

function evenement(partiel: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    type: 'INITIAL_PURCHASE',
    appUserId: PROFIL,
    eventAt: new Date('2026-08-28T10:00:00.000Z'),
    expiresAt: new Date('2026-09-28T10:00:00.000Z'),
    originalAppUserId: null,
    ...partiel,
  };
}

describe('EntitlementsService.applyRevenueCatEvent', () => {
  it('ouvre un abonnement et enregistre son échéance', async () => {
    const { service, ecritures } = stubSupabase({
      plan: 'freemium',
      status: 'active',
      expires_at: null,
      last_event_at: null,
    });

    await service.applyRevenueCatEvent(evenement());

    expect(ecritures).toHaveLength(1);
    expect(ecritures[0]).toMatchObject({
      plan: 'subscription',
      status: 'active',
      expires_at: '2026-09-28T10:00:00.000Z',
      last_event_at: '2026-08-28T10:00:00.000Z',
    });
  });

  it('ne fait confiance à la garde en mémoire qu’avec l’arbitrage de Postgres', async () => {
    // La lecture puis la garde en mémoire, seules, laisseraient deux livraisons
    // concurrentes du même événement — ou deux événements pour le même profil
    // arrivés ensemble — passer toutes les deux, et la plus ancienne pourrait
    // écrire en dernier. Le filtre sur `.update()` fait trancher la base, pas
    // le process : PostgREST ne patchera pas la ligne si `last_event_at` a
    // bougé entre-temps.
    const { service, chaineEcriture } = stubSupabase({
      plan: 'freemium',
      status: 'active',
      expires_at: null,
      last_event_at: null,
    });

    await service.applyRevenueCatEvent(evenement());

    expect(chaineEcriture()).toContainEqual({
      methode: 'or',
      args: ['last_event_at.is.null,last_event_at.lt.2026-08-28T10:00:00.000Z'],
    });
  });

  it('n’écrit que sur la ligne du profil concerné', async () => {
    // Sans ce filtre, la mise à jour PostgREST porte sur toute la table : un
    // seul achat rendrait la plateforme entière abonnée, et rien d'autre ici
    // ne le verrait — les valeurs écrites, elles, seraient les bonnes.
    const { service, chaineEcriture } = stubSupabase({
      plan: 'freemium',
      status: 'active',
      expires_at: null,
      last_event_at: null,
    });

    await service.applyRevenueCatEvent(evenement());

    expect(chaineEcriture()).toContainEqual({
      methode: 'eq',
      args: ['profile_id', PROFIL],
    });
  });

  it('lit les colonnes dont la décision dépend', async () => {
    // `last_event_at` porte toute la détection du rejeu : l'oublier du `select`
    // le rendrait indéfini, donc jamais périmé, donc toujours réappliqué.
    const { service, chaineLecture } = stubSupabase({
      plan: 'freemium',
      status: 'active',
      expires_at: null,
      last_event_at: null,
    });

    await service.applyRevenueCatEvent(evenement());

    const select = chaineLecture().find(({ methode }) => methode === 'select');

    expect(select?.args[0]).toContain('last_event_at');
    expect(select?.args[0]).toContain('expires_at');
    expect(chaineLecture()).toContainEqual({
      methode: 'eq',
      args: ['profile_id', PROFIL],
    });
  });

  it('enregistre l’identifiant RevenueCat du souscripteur sur une ouverture', async () => {
    // Seul lien vers le compte RevenueCat en cas de litige sur un
    // remboursement : sans lui, un `revenuecat_id` resterait nul pour
    // toujours.
    const { service, ecritures } = stubSupabase({
      plan: 'freemium',
      status: 'active',
      expires_at: null,
      last_event_at: null,
    });

    await service.applyRevenueCatEvent(
      evenement({ originalAppUserId: 'rc-sub-8f3a10c7e1' }),
    );

    expect(ecritures[0]).toMatchObject({ revenuecat_id: 'rc-sub-8f3a10c7e1' });
  });

  it('n’écrit pas de revenuecat_id quand l’événement ne le porte pas', async () => {
    // Un défaut d'écriture, jamais un effacement d'une valeur déjà posée par
    // un événement précédent.
    const { service, ecritures } = stubSupabase({
      plan: 'freemium',
      status: 'active',
      expires_at: null,
      last_event_at: null,
    });

    await service.applyRevenueCatEvent(evenement());

    expect(ecritures[0]).not.toHaveProperty('revenuecat_id');
  });

  it('ouvre un lifetime sans échéance', async () => {
    const { service, ecritures } = stubSupabase({
      plan: 'freemium',
      status: 'active',
      expires_at: null,
      last_event_at: null,
    });

    await service.applyRevenueCatEvent(
      evenement({ type: 'NON_RENEWING_PURCHASE', expiresAt: null }),
    );

    expect(ecritures[0]).toMatchObject({
      plan: 'lifetime',
      status: 'active',
      expires_at: null,
    });
  });

  it('ne réécrit pas le plan sur une fin d’accès', async () => {
    // Le remboursement d'un lifetime doit retirer l'accès sans transformer
    // l'historique du compte en abonnement.
    const { service, ecritures } = stubSupabase({
      plan: 'lifetime',
      status: 'active',
      expires_at: null,
      last_event_at: '2026-08-01T10:00:00.000Z',
    });

    await service.applyRevenueCatEvent(evenement({ type: 'EXPIRATION' }));

    expect(ecritures[0]).toMatchObject({ status: 'expired' });
    expect(ecritures[0]).not.toHaveProperty('plan');
    // Ni l'échéance : une ligne sans `expires_at` est un lifetime, donc
    // l'infini. Lui en poser une, fût-elle lointaine, serait la raccourcir.
    expect(ecritures[0]).not.toHaveProperty('expires_at');
  });

  it('prolonge le terme sur un incident de facturation', async () => {
    // BILLING_ISSUE survient quand un renouvellement échoue, donc au terme ou
    // après : l'échéance en base est déjà passée. N'écrire que le statut
    // fermait l'accès à la seconde où le compte entrait en période de grâce,
    // alors que la règle veut l'inverse. L'événement porte la fin de la grâce
    // dans `expiration_at_ms`.
    const { service, ecritures } = stubSupabase({
      plan: 'subscription',
      status: 'active',
      expires_at: '2026-08-28T09:00:00.000Z',
      last_event_at: '2026-08-01T10:00:00.000Z',
    });

    await service.applyRevenueCatEvent(
      evenement({
        type: 'BILLING_ISSUE',
        expiresAt: new Date('2026-09-11T09:00:00.000Z'),
      }),
    );

    expect(ecritures[0]).toMatchObject({
      status: 'in_grace_period',
      expires_at: '2026-09-11T09:00:00.000Z',
    });
    // La distinction grant/status tient : une fin d'accès ne dit rien du plan.
    expect(ecritures[0]).not.toHaveProperty('plan');
  });

  it('ne raccourcit jamais un terme déjà payé', async () => {
    // Une résiliation porte l'échéance du terme en cours, pas une nouvelle :
    // l'accès va jusqu'au bout de ce qui est payé. Si l'événement ne repousse
    // rien, l'échéance n'est pas réécrite du tout.
    const { service, ecritures } = stubSupabase({
      plan: 'subscription',
      status: 'active',
      expires_at: '2026-09-28T10:00:00.000Z',
      last_event_at: '2026-08-01T10:00:00.000Z',
    });

    await service.applyRevenueCatEvent(
      evenement({
        type: 'CANCELLATION',
        expiresAt: new Date('2026-09-28T10:00:00.000Z'),
      }),
    );

    expect(ecritures[0]).toMatchObject({ status: 'cancelled' });
    expect(ecritures[0]).not.toHaveProperty('expires_at');
  });

  it('ignore un événement plus ancien que le dernier appliqué', async () => {
    // RevenueCat rejoue. Un CANCELLATION rejoué en retard écraserait un
    // réabonnement déjà enregistré.
    const { service, ecritures } = stubSupabase({
      plan: 'subscription',
      status: 'active',
      expires_at: '2026-09-28T10:00:00.000Z',
      last_event_at: '2026-08-28T12:00:00.000Z',
    });

    await service.applyRevenueCatEvent(
      evenement({
        type: 'CANCELLATION',
        eventAt: new Date('2026-08-28T09:00:00.000Z'),
      }),
    );

    expect(ecritures).toHaveLength(0);
  });

  it('ignore un événement déjà appliqué, à l’horodatage identique', async () => {
    const { service, ecritures } = stubSupabase({
      plan: 'subscription',
      status: 'active',
      expires_at: '2026-09-28T10:00:00.000Z',
      last_event_at: '2026-08-28T10:00:00.000Z',
    });

    await service.applyRevenueCatEvent(evenement());

    expect(ecritures).toHaveLength(0);
  });

  it('n’écrit rien sur un type inconnu', async () => {
    const { service, ecritures } = stubSupabase({
      plan: 'freemium',
      status: 'active',
      expires_at: null,
      last_event_at: null,
    });

    await service.applyRevenueCatEvent(evenement({ type: 'TRANSFER' }));

    expect(ecritures).toHaveLength(0);
  });

  it('ne rejoue pas une erreur de forme, il la journalise', async () => {
    // 22P02 = « invalid input syntax for type … ». Aucun rejeu ne corrigera la
    // valeur envoyée : remonter l'erreur ferait répondre 5xx, et RevenueCat
    // rejouerait indéfiniment un événement définitivement mort.
    const { service, ecritures } = stubSupabase(null, {
      lecture: erreurPg('22P02', 'invalid input syntax for type uuid'),
    });

    await expect(service.applyRevenueCatEvent(evenement())).resolves.toBeUndefined();
    expect(ecritures).toHaveLength(0);
  });

  it('remonte une vraie panne, seul cas où un rejeu sert', async () => {
    const { service } = stubSupabase(null, {
      lecture: erreurPg('08006', 'connection failure'),
    });

    await expect(service.applyRevenueCatEvent(evenement())).rejects.toMatchObject({
      code: '08006',
    });
  });

  it('n’écrit rien pour un profil sans ligne d’entitlement', async () => {
    // Un App User ID qui ne correspond à aucun compte : ne rien créer, la
    // ligne est posée par le trigger d'inscription et pas par un webhook.
    const { service, ecritures } = stubSupabase(null);

    await service.applyRevenueCatEvent(evenement());

    expect(ecritures).toHaveLength(0);
  });
});
