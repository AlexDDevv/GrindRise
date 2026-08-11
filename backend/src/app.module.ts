import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.config';
import { HealthModule } from './health/health.module';
import { EntitlementsModule } from './modules/entitlements/entitlements.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { UsersModule } from './modules/users/users.module';
import { WorkoutsModule } from './modules/workouts/workouts.module';
import { SupabaseModule } from './supabase/supabase.module';

/**
 * Modular monolith : un seul déployable, des modules étanches.
 *
 * Règle de dépendance : les modules métier communiquent par leurs services
 * exportés, jamais en important les providers internes d'un autre module.
 * C'est ce qui rendra une extraction ultérieure (worker, service séparé)
 * mécanique plutôt que douloureuse.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // `validate` transforme process.env en objet AppConfig typé et fait
      // échouer le boot si une variable requise manque.
      validate: validateEnv,
    }),
    SupabaseModule,
    // Avant les modules métier : il enregistre le guard global qui les protège.
    AuthModule,
    HealthModule,
    UsersModule,
    WorkoutsModule,
    GamificationModule,
    EntitlementsModule,
  ],
})
export class AppModule {}
