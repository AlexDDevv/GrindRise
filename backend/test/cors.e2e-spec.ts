import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/bootstrap';

/**
 * CORS de bout en bout, sur la vraie route publique `/health` : la politique
 * est un réglage d'application, pas de contrôleur, donc n'importe quelle route
 * la démontre.
 *
 * Les origines viennent de `CORS_ALLOWED_ORIGINS`, posée par `setup-env.ts` :
 * ce test vérifie donc la chaîne complète, de la variable d'environnement à
 * l'en-tête de réponse, et pas seulement la fonction de décision.
 */
const AUTORISEE = 'https://app.grindrise.fr';
const INCONNUE = 'https://pirate.exemple.fr';

describe('CORS (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('répond au préflet d’une origine autorisée', async () => {
    const response = await request(app.getHttpServer())
      .options('/health')
      .set('Origin', AUTORISEE)
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(AUTORISEE);
    expect(response.headers['access-control-max-age']).toBe('86400');
  });

  it('renvoie l’en-tête d’autorisation sur une requête simple autorisée', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', AUTORISEE)
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe(AUTORISEE);
  });

  it('ne renvoie aucune autorisation à une origine inconnue', async () => {
    const response = await request(app.getHttpServer())
      .options('/health')
      .set('Origin', INCONNUE)
      .set('Access-Control-Request-Method', 'GET');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sert quand même la requête d’une origine inconnue — c’est le navigateur qui bloque', async () => {
    // Le refus CORS n'est pas un refus d'accès : le serveur répond
    // normalement, sans l'en-tête, et c'est le navigateur qui empêche la page
    // appelante de lire la réponse. Un test qui attendrait un 403 ici
    // décrirait une API qui n'existe pas.
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', INCONNUE)
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('ne change rien pour un appel sans en-tête Origin — le cas du mobile natif', async () => {
    // La non-régression demandée : l'app React Native n'envoie pas d'`Origin`,
    // activer CORS ne doit donc rien changer pour elle.
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
