import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';

import type { AppConfig } from '../config/env.config';

/**
 * Type du client tel qu'instancié ici.
 *
 * Deviendra `SupabaseClient<Database>` quand les types seront générés
 * (`npx supabase gen types typescript`), ce qui typera toutes les requêtes.
 */
export type AppSupabaseClient = ReturnType<typeof createClient>;

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
    this.client = createClient(
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
