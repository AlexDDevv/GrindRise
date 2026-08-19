import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/bootstrap';
import { UnsubscribeLinks } from './../src/modules/notifications/unsubscribe-links';
import { SupabaseService } from './../src/supabase/supabase.service';

/**
 * `GET /notifications/unsubscribe` de bout en bout.
 *
 * Ce qui compte ici et qu'aucun test unitaire ne prouve : la route est
 * atteignable **sans en-tête `Authorization`**. Le guard d'authentification est
 * global, un oubli de `@Public()` rendrait tous les liens de désabonnement déjà
 * partis en 401 — panne invisible tant qu'on teste avec un jeton en main.
 *
 * La base est bouchonnée : ces tests ne doivent dépendre d'aucun projet
 * Supabase joignable.
 */
const PROFILE_ID = '3f8b1c2e-6d4a-4f1b-9c7e-2a5d8e0b4f16';

const db: {
  updates: Record<string, unknown>[];
  filters: [string, unknown][];
  updated: { id: string } | null;
} = { updates: [], filters: [], updated: null };

const supabaseStub = {
  client: {
    from: () => {
      const builder = {
        update(values: Record<string, unknown>) {
          db.updates.push(values);
          return builder;
        },
        eq(column: string, value: unknown) {
          db.filters.push([column, value]);
          return builder;
        },
        select: () => builder,
        maybeSingle: () => Promise.resolve({ data: db.updated, error: null }),
      };
      return builder;
    },
  },
};

/** Le jeton que l'API elle-même aurait composé, avec la config des tests. */
function validToken(profileId: string): string {
  const links = new UnsubscribeLinks(
    process.env.UNSUBSCRIBE_TOKEN_SECRET ?? '',
    process.env.PUBLIC_API_URL ?? '',
  );
  return new URL(links.urlFor(profileId)).searchParams.get('token') ?? '';
}

describe('Désabonnement (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    db.updates = [];
    db.filters = [];
    db.updated = { id: PROFILE_ID };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SupabaseService)
      .useValue(supabaseStub)
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('coupe les emails de palier sans exiger de session', async () => {
    const response = await request(app.getHttpServer())
      .get('/notifications/unsubscribe')
      .query({ token: validToken(PROFILE_ID) })
      .expect(200);

    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).toContain('C’est fait');

    expect(db.updates).toEqual([{ notify_level_up: false }]);
    expect(db.filters).toEqual([['id', PROFILE_ID]]);
  });

  it('reste sans effet et répond 400 sur un jeton falsifié', async () => {
    const falsifie = `${validToken(PROFILE_ID).slice(0, -1)}X`;

    const response = await request(app.getHttpServer())
      .get('/notifications/unsubscribe')
      .query({ token: falsifie })
      .expect(400);

    expect(response.text).toContain('Ce lien ne fonctionne pas');
    expect(db.updates).toHaveLength(0);
  });

  it('répond 400 quand le jeton manque', async () => {
    const response = await request(app.getHttpServer())
      .get('/notifications/unsubscribe')
      .expect(400);

    expect(response.text).toContain('Ce lien ne fonctionne pas');
    expect(db.updates).toHaveLength(0);
  });

  it('accepte le POST du désabonnement en un clic (RFC 8058)', async () => {
    // Le bouton que le client mail affiche lui-même, sur la foi de l'en-tête
    // List-Unsubscribe-Post posé par le worker. Sans cette route, ce bouton
    // échouerait en silence.
    const response = await request(app.getHttpServer())
      .post('/notifications/unsubscribe')
      .query({ token: validToken(PROFILE_ID) })
      .type('form')
      .send('List-Unsubscribe=One-Click')
      .expect(200);

    expect(db.updates).toEqual([{ notify_level_up: false }]);
    expect(response.headers['content-type']).toMatch(/text\/html/);
  });

  it('répond 400 au POST d’un jeton falsifié, sans rien écrire', async () => {
    await request(app.getHttpServer())
      .post('/notifications/unsubscribe')
      .query({ token: `${validToken(PROFILE_ID).slice(0, -1)}X` })
      .type('form')
      .send('List-Unsubscribe=One-Click')
      .expect(400);

    expect(db.updates).toHaveLength(0);
  });

  it('reste idempotent : recliquer le lien réussit encore', async () => {
    const token = validToken(PROFILE_ID);

    await request(app.getHttpServer())
      .get('/notifications/unsubscribe')
      .query({ token })
      .expect(200);

    await request(app.getHttpServer())
      .get('/notifications/unsubscribe')
      .query({ token })
      .expect(200);

    expect(db.updates).toHaveLength(2);
  });
});
