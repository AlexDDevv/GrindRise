// `emitDecoratorMetadata` a besoin de ce polyfill pour que `Reflect.getMetadata`
// existe. D'ordinaire c'est `@nestjs/core` qui l'importe en effet de bord au
// démarrage de l'app ; ce test unitaire n'importe rien de Nest, donc il doit
// le faire lui-même.
import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

import { CreateWorkoutDto } from './create-workout.dto';

/**
 * Aplatit récursivement les messages d'une arborescence de `ValidationError`.
 *
 * `@ValidateNested({ each: true })` fait insérer par class-validator un nœud
 * par index de tableau entre la propriété et l'objet imbriqué (`exercises` →
 * index `0` → `exerciseId`/`sets` → index `0` → `type`). Un aplatissement à un
 * seul niveau — celui qu'on écrirait naïvement — rate donc toute erreur portée
 * par un exercice ou une série, qui vivent deux niveaux plus bas ou davantage.
 */
function aplatir(errors: readonly ValidationError[]): string[] {
  return errors.flatMap((e) => [
    ...Object.values(e.constraints ?? {}),
    ...aplatir(e.children ?? []),
  ]);
}

/** Reproduit le `ValidationPipe` global : transformation puis validation. */
async function erreurs(body: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(CreateWorkoutDto, body, {
    enableImplicitConversion: false,
  });
  const result = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  return aplatir(result);
}

const QUAND = '2026-08-20T10:00:00.000Z';
const EXERCICE = '9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f';

describe('CreateWorkoutDto', () => {
  describe('sport à log plat', () => {
    it('accepte une séance de course en métriques', async () => {
      expect(
        await erreurs({
          sportId: 'course',
          performedAt: QUAND,
          metrics: { distanceKm: 8 },
        }),
      ).toEqual([]);
    });

    it('refuse une séance de course portant des exercices', async () => {
      const messages = await erreurs({
        sportId: 'course',
        performedAt: QUAND,
        exercises: [
          { exerciseId: EXERCICE, sets: [{ type: 'reps', reps: 10 }] },
        ],
      });

      expect(messages.join(' ')).toContain('metrics');
    });
  });

  describe('musculation', () => {
    it('accepte une séance structurée', async () => {
      expect(
        await erreurs({
          sportId: 'musculation',
          performedAt: QUAND,
          exercises: [
            {
              exerciseId: EXERCICE,
              sets: [
                { type: 'reps', reps: 10, weightKg: 80 },
                { type: 'time', durationSeconds: 45, isBodyweight: true },
              ],
            },
          ],
        }),
      ).toEqual([]);
    });

    it('refuse l’ancien format à trois nombres', async () => {
      // La rupture voulue : un client pas encore mis à jour prend un 400 franc
      // plutôt que de voir ses données ignorées en silence.
      const messages = await erreurs({
        sportId: 'musculation',
        performedAt: QUAND,
        metrics: { sets: 4, reps: 10, weightKg: 80 },
      });

      expect(messages.length).toBeGreaterThan(0);
    });

    it('accepte une durée de séance', async () => {
      // La durée est la seule métrique qu'une séance structurée peut porter.
      // Elle est sans effet sur l'XP : `SPORT_RULES` n'a pas d'entrée
      // `musculation`, donc `computeEffortXp` retourne 0 sans lire `metrics`.
      expect(
        await erreurs({
          sportId: 'musculation',
          performedAt: QUAND,
          metrics: { durationMin: 52 },
          exercises: [
            { exerciseId: EXERCICE, sets: [{ type: 'reps', reps: 10 }] },
          ],
        }),
      ).toEqual([]);
    });

    it('accepte une séance sans aucune métrique', async () => {
      // La durée reste facultative : `metrics` absent doit rester valide.
      expect(
        await erreurs({
          sportId: 'musculation',
          performedAt: QUAND,
          exercises: [
            { exerciseId: EXERCICE, sets: [{ type: 'reps', reps: 10 }] },
          ],
        }),
      ).toEqual([]);
    });

    it('refuse une distance, qui ne décrit pas une séance de musculation', async () => {
      const messages = await erreurs({
        sportId: 'musculation',
        performedAt: QUAND,
        metrics: { distanceKm: 8 },
        exercises: [
          { exerciseId: EXERCICE, sets: [{ type: 'reps', reps: 10 }] },
        ],
      });

      expect(messages.length).toBeGreaterThan(0);
    });

    it('refuse une durée accompagnée d’une distance', async () => {
      // Le point du validateur : laisser passer `durationMin` ne doit pas
      // ouvrir la porte au reste de `metrics`.
      const messages = await erreurs({
        sportId: 'musculation',
        performedAt: QUAND,
        metrics: { durationMin: 52, distanceKm: 8 },
        exercises: [
          { exerciseId: EXERCICE, sets: [{ type: 'reps', reps: 10 }] },
        ],
      });

      expect(messages.length).toBeGreaterThan(0);
    });

    it('refuse une durée nulle, que `@IsOptional()` laisserait passer', async () => {
      // `null` n'est pas transmissible en `undefined` par JSON : un client peut
      // vraiment l'envoyer, et il traversait les deux couches de validation.
      const messages = await erreurs({
        sportId: 'musculation',
        performedAt: QUAND,
        metrics: { durationMin: null },
        exercises: [
          { exerciseId: EXERCICE, sets: [{ type: 'reps', reps: 10 }] },
        ],
      });

      expect(messages.length).toBeGreaterThan(0);
    });

    it('refuse une séance sans aucun exercice', async () => {
      const messages = await erreurs({
        sportId: 'musculation',
        performedAt: QUAND,
        exercises: [],
      });

      expect(messages.length).toBeGreaterThan(0);
    });

    it('refuse un exercice sans série', async () => {
      const messages = await erreurs({
        sportId: 'musculation',
        performedAt: QUAND,
        exercises: [{ exerciseId: EXERCICE, sets: [] }],
      });

      expect(messages.length).toBeGreaterThan(0);
    });

    it('refuse un exercice dont la clé `sets` est absente', async () => {
      // Trou n°1 signalé par la revue de la RPC : sans clé `sets`, la base
      // écrirait en silence un exercice sans aucune série.
      const messages = await erreurs({
        sportId: 'musculation',
        performedAt: QUAND,
        exercises: [{ exerciseId: EXERCICE }],
      });

      expect(messages.length).toBeGreaterThan(0);
    });

    it('refuse un exerciseId qui n’est pas un UUID', async () => {
      // Trou n°2 signalé par la revue de la RPC : côté base, ça sort en
      // SQLSTATE 22P02 que l'API traduirait en 500 au lieu d'un 400.
      const messages = await erreurs({
        sportId: 'musculation',
        performedAt: QUAND,
        exercises: [
          { exerciseId: 'pas-un-uuid', sets: [{ type: 'reps', reps: 10 }] },
        ],
      });

      expect(messages.length).toBeGreaterThan(0);
    });

    it('refuse un `exercises` qui n’est pas un tableau', async () => {
      // Trou n°2, second versant : côté base, un `exercises` mal formé sort en
      // SQLSTATE 22023 que l'API traduirait en 500 au lieu d'un 400.
      const messages = await erreurs({
        sportId: 'musculation',
        performedAt: QUAND,
        exercises: { exerciseId: EXERCICE, sets: [{ type: 'reps', reps: 10 }] },
      });

      expect(messages.length).toBeGreaterThan(0);
    });
  });

  describe('forme d’une série', () => {
    async function serie(set: Record<string, unknown>): Promise<string[]> {
      return erreurs({
        sportId: 'musculation',
        performedAt: QUAND,
        exercises: [{ exerciseId: EXERCICE, sets: [set] }],
      });
    }

    it('refuse une série en répétitions sans répétitions', async () => {
      expect(
        (await serie({ type: 'reps', weightKg: 80 })).length,
      ).toBeGreaterThan(0);
    });

    it('refuse une série au temps portant des répétitions', async () => {
      // Jumeau côté API de la contrainte `logged_sets_shape_matches_type` : sans
      // lui, la base refuserait en 500 ce qui est une faute du client.
      expect(
        (await serie({ type: 'time', durationSeconds: 60, reps: 10 })).length,
      ).toBeGreaterThan(0);
    });

    it('refuse un type inconnu', async () => {
      expect((await serie({ type: 'tempo', reps: 10 })).length).toBeGreaterThan(
        0,
      );
    });

    it('accepte une série au poids du corps lestée', async () => {
      expect(
        await serie({
          type: 'reps',
          reps: 8,
          weightKg: 20,
          isBodyweight: true,
        }),
      ).toEqual([]);
    });
  });

  it('refuse toujours un montant d’XP envoyé par le client', async () => {
    const messages = await erreurs({
      sportId: 'musculation',
      performedAt: QUAND,
      xp: 99_999,
      exercises: [{ exerciseId: EXERCICE, sets: [{ type: 'reps', reps: 10 }] }],
    });

    expect(messages.join(' ')).toContain('xp');
  });
});
