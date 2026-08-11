import { Module } from '@nestjs/common';

import { GamificationModule } from '../gamification/gamification.module';
import { NarrativeModule } from '../narrative/narrative.module';
import { UsersModule } from '../users/users.module';
import { WorkoutsController } from './workouts.controller';
import { WorkoutsService } from './workouts.service';

@Module({
  // `UsersModule` pour le profil (fuseau horaire et forme de la réponse) :
  // seul son service exporté est consommé, aucun provider interne.
  //
  // `NarrativeModule` est branché ici et non dans `GamificationModule` : c'est
  // le narratif qui réagit à la progression, jamais l'inverse. Le calcul d'XP
  // n'a pas à connaître l'existence des trames.
  imports: [GamificationModule, NarrativeModule, UsersModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsService],
  exports: [WorkoutsService],
})
export class WorkoutsModule {}
