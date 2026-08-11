import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Métriques d'une séance.
 *
 * Le `ValidationPipe` global tourne en `forbidNonWhitelisted` : un champ non
 * déclaré ici fait échouer la requête au lieu d'être ignoré. C'est ce qui rend
 * un `xp` envoyé par un client malveillant visible plutôt que silencieux — et
 * c'est aussi pour ça que cette classe est imbriquée sous `@ValidateNested()`
 * plutôt que typée `Record<string, unknown>` : un objet libre laisserait passer
 * n'importe quoi jusqu'au `jsonb`.
 *
 * Les bornes hautes sont larges à dessein. Ce ne sont pas des règles de jeu —
 * le plafonnement de l'XP s'en charge et vit dans `xp-rules.ts` — seulement de
 * quoi refuser une valeur qui ne décrit plus un entraînement humain.
 */
export class WorkoutMetricsDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  sets?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1_000)
  reps?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000)
  weightKg?: number;

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

export class CreateWorkoutDto {
  /** Slug de `sports.id`. L'existence est vérifiée par la FK à l'insertion. */
  @IsString()
  @IsNotEmpty()
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
}

/**
 * Aucun `profileId` ici, et c'est délibéré : l'identité vient de
 * `@CurrentUser()`, donc du JWT vérifié. Un champ d'identité dans le corps
 * serait un vecteur d'usurpation, et `forbidNonWhitelisted` le rejette.
 */
