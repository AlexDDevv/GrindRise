import { ConflictException } from '@nestjs/common';

import { SupabaseService } from '../../supabase/supabase.service';
import { ExercisesService } from './exercises.service';

const PROFILE_ID = '3f8b1c2e-6d4a-4f1b-9c7e-2a5d8e0b4f16';

/**
 * Bouchon de PostgREST : les builders sont thenables comme les vrais, et
 * enregistrent leurs appels. C'est la seule façon de vérifier que la
 * visibilité du catalogue est bien rejouée côté API — la clé service_role
 * contourne la RLS, donc l'oublier exposerait le catalogue privé de tous.
 */
function stubSupabase() {
  const calls: { method: string; args: unknown[] }[] = [];
  let insertError: { code?: string; message: string } | null = null;

  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'or', 'eq', 'ilike', 'order', 'insert']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.single = () =>
    Promise.resolve({
      data: insertError ? null : { id: 'x' },
      error: insertError,
    });
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: [], error: null });

  return {
    calls,
    setInsertError(error: { code?: string; message: string } | null) {
      insertError = error;
    },
    service: new ExercisesService({
      client: { from: () => builder },
    } as unknown as SupabaseService),
  };
}

describe('ExercisesService', () => {
  it('ne montre que les prédéfinis et les siens', async () => {
    const { service, calls } = stubSupabase();

    await service.list(PROFILE_ID, {});

    const filtre = calls.find((c) => c.method === 'or');
    expect(filtre?.args[0]).toBe(
      `created_by.is.null,created_by.eq.${PROFILE_ID}`,
    );
  });

  it('échappe les jokers d’une recherche', async () => {
    // Sans échappement, une recherche sur « % » retourne tout le catalogue,
    // customs d'autrui exclus mais bruit compris.
    const { service, calls } = stubSupabase();

    await service.list(PROFILE_ID, { search: '100%_curl' });

    const recherche = calls.find((c) => c.method === 'ilike');
    expect(recherche?.args[1]).toBe('%100\\%\\_curl%');
  });

  it('impose l’identité du jeton comme auteur', async () => {
    const { service, calls } = stubSupabase();

    await service.create(PROFILE_ID, {
      name: 'Curl maison',
      muscleGroup: 'biceps',
    });

    const insertion = calls.find((c) => c.method === 'insert');
    expect(insertion?.args[0]).toEqual({
      name: 'Curl maison',
      muscle_group: 'biceps',
      created_by: PROFILE_ID,
    });
  });

  it('traduit un doublon en 409 plutôt qu’en 500', async () => {
    const { service, setInsertError } = stubSupabase();
    setInsertError({ code: '23505', message: 'duplicate key' });

    await expect(
      service.create(PROFILE_ID, {
        name: 'Curl maison',
        muscleGroup: 'biceps',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
