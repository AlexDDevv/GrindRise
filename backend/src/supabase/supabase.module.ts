import { Global, Module } from '@nestjs/common';

import { SupabaseService } from './supabase.service';

/** Global : tous les modules métier ont besoin de l'accès base. */
@Global()
@Module({
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
