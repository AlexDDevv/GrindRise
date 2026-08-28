import { SupabaseService } from '../../supabase/supabase.service';
import type { RevenueCatEvent } from './contract';
import { EntitlementsService } from './entitlements.service';

const PROFIL = '3f8b1c2e-6d4a-4f1b-9c7e-2a5d8e0b4f16';

type LigneCourante = {
  plan: string;
  status: string;
  last_event_at: string | null;
} | null;

/**
 * Bouchonne Supabase et retient ce qui aurait été écrit.
 *
 * Même approche que `programs.service.spec.ts` : un constructeur chaînable
 * dont chaque méthode se rend elle-même, et une capture des écritures.
 */
function stubSupabase(courante: LigneCourante) {
  const ecritures: Record<string, unknown>[] = [];

  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = () => Promise.resolve({ data: courante, error: null });
  builder.update = (valeurs: Record<string, unknown>) => {
    ecritures.push(valeurs);
    return builder;
  };
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: null, error: null });

  const client = { from: () => builder };

  return {
    ecritures,
    service: new EntitlementsService({ client } as unknown as SupabaseService),
  };
}

function evenement(partiel: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    type: 'INITIAL_PURCHASE',
    appUserId: PROFIL,
    eventAt: new Date('2026-08-28T10:00:00.000Z'),
    expiresAt: new Date('2026-09-28T10:00:00.000Z'),
    ...partiel,
  };
}

describe('EntitlementsService.applyRevenueCatEvent', () => {
  it('ouvre un abonnement et enregistre son échéance', async () => {
    const { service, ecritures } = stubSupabase({
      plan: 'freemium',
      status: 'active',
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

  it('ouvre un lifetime sans échéance', async () => {
    const { service, ecritures } = stubSupabase({
      plan: 'freemium',
      status: 'active',
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
      last_event_at: '2026-08-01T10:00:00.000Z',
    });

    await service.applyRevenueCatEvent(evenement({ type: 'EXPIRATION' }));

    expect(ecritures[0]).toMatchObject({ status: 'expired' });
    expect(ecritures[0]).not.toHaveProperty('plan');
  });

  it('ignore un événement plus ancien que le dernier appliqué', async () => {
    // RevenueCat rejoue. Un CANCELLATION rejoué en retard écraserait un
    // réabonnement déjà enregistré.
    const { service, ecritures } = stubSupabase({
      plan: 'subscription',
      status: 'active',
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
      last_event_at: '2026-08-28T10:00:00.000Z',
    });

    await service.applyRevenueCatEvent(evenement());

    expect(ecritures).toHaveLength(0);
  });

  it('n’écrit rien sur un type inconnu', async () => {
    const { service, ecritures } = stubSupabase({
      plan: 'freemium',
      status: 'active',
      last_event_at: null,
    });

    await service.applyRevenueCatEvent(evenement({ type: 'TRANSFER' }));

    expect(ecritures).toHaveLength(0);
  });

  it('n’écrit rien pour un profil sans ligne d’entitlement', async () => {
    // Un App User ID qui ne correspond à aucun compte : ne rien créer, la
    // ligne est posée par le trigger d'inscription et pas par un webhook.
    const { service, ecritures } = stubSupabase(null);

    await service.applyRevenueCatEvent(evenement());

    expect(ecritures).toHaveLength(0);
  });
});
