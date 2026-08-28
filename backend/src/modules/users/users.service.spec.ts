import { NotFoundException } from '@nestjs/common';

import { SupabaseService } from '../../supabase/supabase.service';
import { UsersService } from './users.service';

const PROFIL = '3f8b1c2e-6d4a-4f1b-9c7e-2a5d8e0b4f16';

function stubSupabase(ligne: Record<string, unknown> | null) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = () => Promise.resolve({ data: ligne, error: null });

  const client = { from: () => builder };

  return new UsersService({ client } as unknown as SupabaseService);
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
    const service = stubSupabase(LIGNE);

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
    const service = stubSupabase({ ...LIGNE, entitlements: null });

    const { entitlement } = await service.getProfile(PROFIL);

    expect(entitlement).toEqual({
      plan: 'freemium',
      status: 'active',
      expires_at: null,
    });
  });

  it('lève un 404 quand le profil n’existe pas', async () => {
    const service = stubSupabase(null);

    await expect(service.getProfile(PROFIL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
