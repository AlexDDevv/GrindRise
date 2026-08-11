import { Module } from '@nestjs/common';

import { GamificationModule } from '../gamification/gamification.module';
import { UsersModule } from '../users/users.module';
import { WorkoutsController } from './workouts.controller';
import { WorkoutsService } from './workouts.service';

@Module({
  // `UsersModule` pour le profil (fuseau horaire et forme de la réponse) :
  // seul son service exporté est consommé, aucun provider interne.
  imports: [GamificationModule, UsersModule],
  controllers: [WorkoutsController],
  providers: [WorkoutsService],
  exports: [WorkoutsService],
})
export class WorkoutsModule {}
