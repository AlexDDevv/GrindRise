import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../auth/authenticated-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  CreateProgramDto,
  CreateProgramWorkoutDto,
  RenameDto,
  ReplaceExercisesDto,
} from './dto/program.dto';
import {
  ProgramsService,
  type Program,
  type ProgramWorkout,
} from './programs.service';

@Controller()
export class ProgramsController {
  constructor(private readonly programs: ProgramsService) {}

  @Get('programs')
  list(@CurrentUser() user: AuthenticatedUser): Promise<Program[]> {
    return this.programs.list(user.id);
  }

  @Post('programs')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateProgramDto,
  ): Promise<Program> {
    return this.programs.create(user.id, body);
  }

  @Patch('programs/:id')
  rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RenameDto,
  ): Promise<Program> {
    return this.programs.rename(user.id, id, body);
  }

  @Delete('programs/:id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.programs.remove(user.id, id);
  }

  @Post('programs/:id/workouts')
  addWorkout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateProgramWorkoutDto,
  ): Promise<ProgramWorkout> {
    return this.programs.addWorkout(user.id, id, body);
  }

  @Patch('program-workouts/:id')
  renameWorkout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RenameDto,
  ): Promise<ProgramWorkout> {
    return this.programs.renameWorkout(user.id, id, body);
  }

  @Delete('program-workouts/:id')
  @HttpCode(204)
  removeWorkout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.programs.removeWorkout(user.id, id);
  }

  /**
   * La liste complète, pas un ajout : réordonner devient l'envoi d'un tableau,
   * et aucun état intermédiaire ne fait partager un rang à deux exercices.
   */
  @Put('program-workouts/:id/exercises')
  replaceExercises(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReplaceExercisesDto,
  ): Promise<unknown> {
    return this.programs.replaceExercises(user.id, id, body);
  }
}
