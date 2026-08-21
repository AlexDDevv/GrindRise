import { NotFoundException } from '@nestjs/common';

import { SupabaseService } from '../../supabase/supabase.service';
import { ProgramsService } from './programs.service';

const MOI = '3f8b1c2e-6d4a-4f1b-9c7e-2a5d8e0b4f16';
const JOUR = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const EXERCICE = '9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f';

function stubSupabase(
  options: {
    ownedWorkout?: boolean;
    rpcError?: { code?: string; message: string } | null;
  } = {},
) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

  const builder: Record<string, unknown> = {};
  for (const method of [
    'select',
    'eq',
    'insert',
    'update',
    'delete',
    'order',
  ]) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = () =>
    Promise.resolve({
      data: options.ownedWorkout === false ? null : { id: JOUR },
      error: null,
    });
  builder.single = () => Promise.resolve({ data: { id: JOUR }, error: null });
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: [], error: null });

  const client = {
    from: () => builder,
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({
        data: [],
        error: options.rpcError ?? null,
      });
    },
  };

  return {
    rpcCalls,
    service: new ProgramsService({ client } as unknown as SupabaseService),
  };
}

describe('ProgramsService', () => {
  it('répond 404 sur le jour d’un autre profil — jamais 403', async () => {
    // Un 403 confirmerait que l'identifiant existe, et donnerait de quoi
    // énumérer les programmes d'autrui.
    const { service } = stubSupabase({ ownedWorkout: false });

    await expect(
      service.replaceExercises(MOI, JOUR, { exerciseIds: [EXERCICE] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remplace la liste par la RPC, avec l’identité du jeton', async () => {
    const { service, rpcCalls } = stubSupabase();

    await service.replaceExercises(MOI, JOUR, { exerciseIds: [EXERCICE] });

    expect(rpcCalls[0]).toEqual({
      fn: 'replace_program_workout_exercises',
      args: {
        p_profile_id: MOI,
        p_program_workout_id: JOUR,
        p_exercise_ids: [EXERCICE],
      },
    });
  });

  it('traduit GR003 en 404', async () => {
    const { service } = stubSupabase({
      rpcError: { code: 'GR003', message: 'jour de programme inaccessible' },
    });

    await expect(
      service.replaceExercises(MOI, JOUR, { exerciseIds: [EXERCICE] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
