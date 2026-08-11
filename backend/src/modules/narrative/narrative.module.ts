import { Module } from '@nestjs/common';

import { NarrativeController } from './narrative.controller';
import { NarrativeService } from './narrative.service';

/**
 * Le narratif se greffe sur la progression sans y toucher : il n'importe ni
 * `GamificationModule` ni `UsersModule`, il lit l'état en base. C'est ce qui
 * permet au calcul d'XP de rester ignorant de son existence.
 */
@Module({
  controllers: [NarrativeController],
  providers: [NarrativeService],
  exports: [NarrativeService],
})
export class NarrativeModule {}
