import { NotFoundException } from '@nestjs/common';

import { SupabaseService } from '../../supabase/supabase.service';
import { UsersService } from './users.service';

const PROFIL = '3f8b1c2e-6d4a-4f1b-9c7e-2a5d8e0b4f16';

/** Un appel au builder PostgREST, arguments compris. */
type Appel = { methode: string; args: unknown[] };

/**
 * Bouchonne Supabase et retient chaque appel avec ses arguments.
 *
 * Un bouchon qui ignore les arguments laisse supprimer l'embed
 * `entitlements(…)` du `select` sans qu'aucun test ne le voie : la ligne
 * bouchonnée le porterait quand même, et tout compte réel retomberait
 * silencieusement en freemium.
 */
function stubSupabase(ligne: Record<string, unknown> | null) {
  const appels: Appel[] = [];

  const builder: Record<string, unknown> = {};
  for (const methode of ['select', 'eq']) {
    builder[methode] = (...args: unknown[]) => {
      appels.push({ methode, args });
      return builder;
    };
  }
  builder.maybeSingle = () => Promise.resolve({ data: ligne, error: null });

  const client = { from: () => builder };

  return {
    appels,
    service: new UsersService({ client } as unknown as SupabaseService),
  };
}

const LIGNE = {
  id: PROFIL,
  class_id: 'guerrier',
  user_progress: { profile_id: PROFIL, level: 12, current_xp: 15_900 },
  // Trois colonnes seulement : c'est exactement ce que le `select` demande.
  entitlements: {
    plan: 'subscription',
    status: 'active',
    expires_at: '2026-09-28T10:00:00.000Z',
  },
};

describe('UsersService.getProfile', () => {
  it('sépare le profil, la progression et le droit d’accès', async () => {
    const { service } = stubSupabase(LIGNE);

    const { profile, progress, entitlement } = await service.getProfile(PROFIL);

    expect(profile).toMatchObject({ id: PROFIL, class_id: 'guerrier' });
    expect(profile).not.toHaveProperty('user_progress');
    expect(profile).not.toHaveProperty('entitlements');
    expect(progress).toMatchObject({ level: 12 });
    expect(entitlement).toMatchObject({
      plan: 'subscription',
      status: 'active',
    });
  });

  it('retombe sur un freemium actif quand la ligne manque', async () => {
    // Le trigger `handle_new_user` la crée, mais un compte importé ou une
    // course au premier démarrage pourrait la trouver absente. Le défaut le
    // plus restrictif est le bon : jamais accorder par défaut d'accès payant.
    const { service } = stubSupabase({ ...LIGNE, entitlements: null });

    const { entitlement } = await service.getProfile(PROFIL);

    expect(entitlement).toEqual({
      plan: 'freemium',
      status: 'active',
      expires_at: null,
    });
  });

  it('lève un 404 quand le profil n’existe pas', async () => {
    const { service } = stubSupabase(null);

    await expect(service.getProfile(PROFIL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('demande l’embed du droit d’accès, et sur la ligne du sujet', async () => {
    // La forme de la réponse ne prouve rien ici : le bouchon rend la ligne
    // quoi qu'on demande. Retirer `entitlements(…)` du `select` ferait
    // retomber tout compte réel en freemium sans qu'un seul test ne bouge —
    // c'est donc la requête elle-même qu'il faut épingler.
    const { service, appels } = stubSupabase(LIGNE);

    await service.getProfile(PROFIL);

    const select = appels.find(({ methode }) => methode === 'select');

    expect(select?.args[0]).toContain('entitlements(plan, status, expires_at)');
    expect(appels).toContainEqual({ methode: 'eq', args: ['id', PROFIL] });
  });
});
