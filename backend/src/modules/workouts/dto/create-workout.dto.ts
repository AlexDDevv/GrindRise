import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  Validate,
  ValidateNested,
} from 'class-validator';

import {
  LoggedSetShapeMatchesType,
  WorkoutPayloadMatchesSport,
} from './coherence.validators';

/**
 * Métriques d'une séance à log plat (course, natation, cyclisme).
 *
 * La musculation n'en fait plus partie : sa séance se décrit en `exercises`.
 * `sets`, `reps` et `weightKg` ont donc disparu d'ici. Comme le pipe tourne en
 * `forbidNonWhitelisted`, un client pas encore mis à jour prendra un 400 franc
 * — ce qui est le comportement voulu : une rupture bruyante plutôt qu'une
 * séance enregistrée amputée sans que personne ne le voie.
 *
 * Les bornes hautes restent larges à dessein. Ce ne sont pas des règles de jeu
 * — le plafonnement de l'XP s'en charge et vit dans `xp-rules.ts` — seulement
 * de quoi refuser une valeur qui ne décrit plus un entraînement humain.
 */
export class WorkoutMetricsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000)
  distanceKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100_000)
  distanceM?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1_440)
  durationMin?: number;
}

/**
 * Une série.
 *
 * Bornes hautes larges, même principe que les métriques : dix heures de
 * gainage ou mille répétitions ne décrivent plus un entraînement humain, mais
 * en deçà on n'a pas à juger.
 */
export class LoggedSetDto {
  // La contrainte de cohérence est accrochée ici parce que c'est ce champ qui
  // décide de la règle.
  @IsIn(['reps', 'time'])
  @Validate(LoggedSetShapeMatchesType)
  type!: 'reps' | 'time';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000)
  reps?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36_000)
  durationSeconds?: number;

  /** Charge externe, ou lest additionnel si `isBodyweight`. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000)
  weightKg?: number;

  @IsOptional()
  @IsBoolean()
  isBodyweight?: boolean;
}

export class LoggedExerciseDto {
  @IsUUID()
  exerciseId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => LoggedSetDto)
  sets!: LoggedSetDto[];
}

export class CreateWorkoutDto {
  /** Slug de `sports.id`. L'existence est vérifiée par la FK à l'insertion. */
  @IsString()
  @IsNotEmpty()
  // Accrochée ici parce que c'est le sport qui décide de la forme du reste.
  @Validate(WorkoutPayloadMatchesSport)
  sportId!: string;

  /**
   * Instant de la séance, en ISO 8601 avec fuseau.
   *
   * Le serveur le convertit dans le fuseau du profil pour décider de son jour
   * local : c'est ce jour, et non l'instant brut, qui gouverne le streak et le
   * plafond journalier.
   */
  @IsISO8601({ strict: true })
  performedAt!: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => WorkoutMetricsDto)
  metrics?: WorkoutMetricsDto;

  /**
   * Séance structurée. Réservée aux sports à log structuré, et obligatoire
   * pour eux : la contrainte sur `sportId` s'en charge.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => LoggedExerciseDto)
  exercises?: LoggedExerciseDto[];

  /** Jour type suivi, ou absent pour une séance libre. */
  @IsOptional()
  @IsUUID()
  programWorkoutId?: string;
}

/**
 * Aucun `profileId` ici, et c'est délibéré : l'identité vient de
 * `@CurrentUser()`, donc du JWT vérifié. Un champ d'identité dans le corps
 * serait un vecteur d'usurpation, et `forbidNonWhitelisted` le rejette.
 */
