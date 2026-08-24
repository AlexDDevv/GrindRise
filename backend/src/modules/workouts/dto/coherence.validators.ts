/**
 * Les deux règles de cohérence du corps de `POST /workouts`.
 *
 * Elles ne pouvaient pas s'écrire en décorateurs de propriété : `@ValidateIf`
 * s'applique à toute une propriété, donc il ne sait pas porter « requis dans
 * ce cas, interdit dans l'autre » sur le même champ. Ces contraintes lisent
 * l'objet entier via `args.object`, ce qui les rend capables de l'exprimer.
 *
 * Elles sont accrochées à une propriété (`sportId`, `type`) faute de
 * décorateur de classe dans class-validator — c'est l'idiome habituel, et la
 * propriété choisie est celle qui décide de la règle.
 */

import {
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { isStructuredLogSport } from '../strength-log';

/**
 * `metrics` absent, ou ne portant que `durationMin`.
 *
 * La durée est la seule métrique qu'une séance à log structuré peut porter :
 * elle décrit la séance sans décrire son contenu, que `exercises` porte déjà.
 * Une distance, elle, ne veut rien dire pour de la musculation, et l'accepter
 * rouvrirait exactement ce que ce validateur ferme — une séance dont on ne
 * sait plus laquelle des deux descriptions lire.
 *
 * Elle est sans danger pour le barème, et pas par précaution d'écriture :
 * `SPORT_RULES` n'a pas d'entrée `musculation`, donc `computeEffortXp` retourne
 * 0 avant même de lire ces métriques. Si cette entrée réapparaissait un jour,
 * la durée redeviendrait falsifiable — c'est là qu'il faudrait regarder.
 */
function metricsCarryOnlyDuration(metrics: unknown): boolean {
  if (metrics === undefined) return true;
  if (typeof metrics !== 'object' || metrics === null) return false;

  // `plainToInstance` expose par défaut tous les champs déclarés de
  // `WorkoutMetricsDto`, même absents du corps envoyé — avec `undefined` pour
  // valeur. `Object.keys` les compterait donc à tort ; seule une clé dont la
  // valeur est définie porte une métrique effectivement envoyée.
  return Object.entries(metrics).every(([key, value]) => {
    // Champ déclaré mais non envoyé : il ne compte pas.
    if (value === undefined) return true;
    if (key !== 'durationMin') return false;

    // `@IsOptional()` traite `null` comme une absence et court-circuite
    // `@IsNumber()`, `@Min()` et `@Max()`. Sans ce refus, `{ durationMin: null }`
    // traverserait les deux couches et se retrouverait tel quel en jsonb.
    return value !== null;
  });
}

/**
 * Le sport décide de la forme du corps.
 *
 * Musculation : une liste d'exercices, jamais de `metrics`. Les autres sports :
 * l'inverse. Sans cette règle, un client pourrait envoyer les deux et laisser
 * le serveur choisir — donc écrire une séance dont on ne sait pas la lire.
 */
@ValidatorConstraint({ name: 'workoutPayloadMatchesSport', async: false })
export class WorkoutPayloadMatchesSport implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const body = args.object as {
      sportId?: unknown;
      metrics?: unknown;
      exercises?: unknown;
      programWorkoutId?: unknown;
    };

    if (isStructuredLogSport(body.sportId)) {
      return (
        metricsCarryOnlyDuration(body.metrics) &&
        Array.isArray(body.exercises) &&
        body.exercises.length > 0
      );
    }

    return body.exercises === undefined && body.programWorkoutId === undefined;
  }

  defaultMessage(args: ValidationArguments): string {
    const body = args.object as { sportId?: unknown };

    return isStructuredLogSport(body.sportId)
      ? 'Ce sport se logue en `exercises` (au moins un exercice), et sans autre métrique que `durationMin`.'
      : 'Ce sport se logue en `metrics` : `exercises` et `programWorkoutId` ne s’y appliquent pas.';
  }
}

/**
 * Une série dit comment elle se compte, et ne porte que ce qui va avec.
 *
 * Jumeau côté API de la contrainte `logged_sets_shape_matches_type`. Sans lui,
 * la base refuserait en 500 ce qui est une faute du client, et le mobile n'en
 * saurait rien de plus.
 */
@ValidatorConstraint({ name: 'loggedSetShapeMatchesType', async: false })
export class LoggedSetShapeMatchesType implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const set = args.object as {
      type?: unknown;
      reps?: unknown;
      durationSeconds?: unknown;
    };

    if (set.type === 'reps') {
      return set.reps !== undefined && set.durationSeconds === undefined;
    }

    if (set.type === 'time') {
      return set.durationSeconds !== undefined && set.reps === undefined;
    }

    return false;
  }

  defaultMessage(): string {
    return 'Une série `reps` porte `reps` seul ; une série `time` porte `durationSeconds` seul.';
  }
}
