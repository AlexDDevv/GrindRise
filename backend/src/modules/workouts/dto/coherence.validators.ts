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
        body.metrics === undefined &&
        Array.isArray(body.exercises) &&
        body.exercises.length > 0
      );
    }

    return body.exercises === undefined && body.programWorkoutId === undefined;
  }

  defaultMessage(args: ValidationArguments): string {
    const body = args.object as { sportId?: unknown };

    return isStructuredLogSport(body.sportId)
      ? 'Ce sport se logue en `exercises` (au moins un exercice), et sans `metrics`.'
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
