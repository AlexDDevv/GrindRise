import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { SupabaseAuthGuard } from './supabase-auth.guard';

/**
 * Authentification des appelants de l'API.
 *
 * `APP_GUARD` applique le guard à **toutes** les routes de l'application, y
 * compris celles ajoutées plus tard. Une route reste ouverte uniquement si
 * elle porte `@Public()` — et ce décorateur oblige à écrire pourquoi.
 *
 * L'alternative (`@UseGuards(SupabaseAuthGuard)` posé endpoint par endpoint)
 * fait de l'oubli le cas ouvert : `POST /workouts` accepterait n'importe quel
 * `profile_id`. C'est exactement la dette que cette phase solde.
 */
@Module({
  providers: [{ provide: APP_GUARD, useClass: SupabaseAuthGuard }],
})
export class AuthModule {}
