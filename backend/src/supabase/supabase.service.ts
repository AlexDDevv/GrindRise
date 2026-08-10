import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { AppConfig } from '../config/env.config';
import type { Database } from '../database.types';

/**
 * Client typé sur le schéma réel de la base.
 *
 * `database.types.ts` est généré par `pnpm db:types` à la racine du monorepo
 * et copié ici : le contexte de build Docker est limité à `backend/`, un
 * import hors de ce dossier serait introuvable au déploiement.
 * À régénérer après chaque migration.
 */
export type AppSupabaseClient = SupabaseClient<Database>;

/**
 * Client Supabase serveur, avec la clé `service_role`.
 *
 * ATTENTION : ce client **contourne la RLS**. Il ne doit jamais être exposé
 * directement à une requête client ; c'est lui qui écrit `xp_events`,
 * `user_progress` et `entitlements`, tables interdites en écriture au mobile.
 *
 * Le mobile, lui, utilise la clé `anon` et reste soumis aux policies.
 */
@Injectable()
export class SupabaseService {
  readonly client: AppSupabaseClient;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.client = createClient<Database>(
      this.config.get('supabaseUrl', { infer: true }),
      this.config.get('supabaseServiceRoleKey', { infer: true }),
      {
        auth: {
          // Process serveur : aucune session à persister ni à rafraîchir.
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }
}
