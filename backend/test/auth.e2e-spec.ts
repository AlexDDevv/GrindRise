import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from 'jose';
import request from 'supertest';
import type { App } from 'supertest/types';

import { SupabaseService } from '../src/supabase/supabase.service';
import { startJwksServer, type JwksServer } from './jwks-server';

/**
 * Vérifie le guard global sur son vrai chemin d'exécution : un JWKS servi en
 * local, des jetons réellement signés, et `jose` qui va chercher la clé.
 *
 * Rien n'est simulé côté vérification — un test qui remplacerait `jwtVerify`
 * par un bouchon ne prouverait que le câblage Nest, pas la sécurité.
 */
const KEY_ID = 'test-signing-key';
const PROFILE_ID = '3f8b1c2e-6d4a-4f1b-9c7e-2a5d8e0b4f16';

const PROFILE_ROW = {
  id: PROFILE_ID,
  username: 'grind',
  class_id: 'berserker',
  created_at: '2026-08-11T09:00:00.000Z',
};

const PROGRESS_ROW = {
  profile_id: PROFILE_ID,
  level: 3,
  current_xp: 420,
  streak_days: 5,
  updated_at: '2026-08-11T09:00:00.000Z',
};

type SignedTokenOptions = {
  /** Signe avec une clé absente du JWKS, pour simuler un jeton forgé. */
  useForeignKey?: boolean;
  role?: string;
  expiresAt?: number;
};

/**
 * Bouchon de `SupabaseService`.
 *
 * Il enregistre la requête reçue : c'est ce qui permet de vérifier que
 * l'endpoint interroge bien le profil du **sujet du jeton**, et non un
 * identifiant qui viendrait de l'appelant. Sans cette assertion, le test
 * passerait tout aussi bien si `/users/me` servait le profil de n'importe qui.
 */
const supabase: {
  response: { data: unknown; error: { message: string } | null };
  lastQuery?: {
    table: string;
    columns: string;
    column: string;
    value: unknown;
  };
} = { response: { data: null, error: null } };

const supabaseStub = {
  client: {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: unknown) => ({
          maybeSingle: () => {
            supabase.lastQuery = { table, columns, column, value };
            return Promise.resolve(supabase.response);
          },
        }),
      }),
    }),
  },
};

describe('SupabaseAuthGuard (e2e)', () => {
  let app: INestApplication<App>;
  let jwks: JwksServer;
  let signingKey: KeyLike;
  let foreignKey: KeyLike;
  let issuer: string;

  beforeAll(async () => {
    // `extractable` : nécessaire pour publier la partie publique dans le JWKS.
    const trusted = await generateKeyPair('ES256', { extractable: true });
    const foreign = await generateKeyPair('ES256', { extractable: true });
    signingKey = trusted.privateKey;
    foreignKey = foreign.privateKey;

    // Même `kid` des deux côtés : le jeton forgé est donc rejeté sur la
    // signature elle-même, pas sur une simple clé introuvable. C'est le cas
    // qui compte.
    const publicJwk = await exportJWK(trusted.publicKey);
    jwks = await startJwksServer({
      ...publicJwk,
      kid: KEY_ID,
      alg: 'ES256',
      use: 'sig',
    });

    issuer = `${jwks.url}/auth/v1`;

    // `SUPABASE_URL` doit pointer sur le serveur JWKS AVANT le chargement
    // d'`AppModule` : `ConfigModule.forRoot({ validate })` lit process.env dès
    // l'import du module, pas à l'initialisation. D'où le `require` explicite
    // ici plutôt qu'un `import` en tête de fichier, qui serait hissé.
    process.env.SUPABASE_URL = jwks.url;

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');
    /* eslint-enable @typescript-eslint/no-require-imports */

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Le guard est testé pour de vrai ; la base, non — ces tests ne doivent
      // dépendre d'aucun projet Supabase joignable.
      .overrideProvider(SupabaseService)
      .useValue(supabaseStub)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    supabase.response = { data: null, error: null };
    supabase.lastQuery = undefined;
  });

  afterAll(async () => {
    await app.close();
    await jwks.close();
  });

  function signToken({
    useForeignKey = false,
    role = 'authenticated',
    expiresAt,
  }: SignedTokenOptions = {}): Promise<string> {
    const nowInSeconds = Math.floor(Date.now() / 1000);

    return new SignJWT({ role, email: 'grind@example.test' })
      .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setSubject(PROFILE_ID)
      .setIssuedAt(nowInSeconds - 60)
      .setExpirationTime(expiresAt ?? nowInSeconds + 3600)
      .sign(useForeignKey ? foreignKey : signingKey);
  }

  describe('routes publiques', () => {
    it('laisse passer /health sans jeton', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect({ status: 'ok' });
    });
  });

  describe('routes protégées', () => {
    it('refuse une requête sans en-tête Authorization', () => {
      return request(app.getHttpServer()).get('/users/me').expect(401);
    });

    it('refuse un schéma d’authentification autre que Bearer', () => {
      return request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', 'Basic Zm9vOmJhcg==')
        .expect(401);
    });

    it('refuse un jeton signé par une clé absente du JWKS', async () => {
      const token = await signToken({ useForeignKey: true });

      return request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('refuse un jeton expiré', async () => {
      const token = await signToken({
        expiresAt: Math.floor(Date.now() / 1000) - 60,
      });

      return request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('refuse un jeton de rôle anon', async () => {
      // La clé `anon` du projet est signée par Supabase : seule la claim
      // `role` distingue un utilisateur connecté d'un porteur de clé publique.
      const token = await signToken({ role: 'anon' });

      return request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('sert le profil du sujet du jeton', async () => {
      supabase.response = {
        data: { ...PROFILE_ROW, user_progress: PROGRESS_ROW },
        error: null,
      };
      const token = await signToken();

      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual({
        profile: PROFILE_ROW,
        progress: PROGRESS_ROW,
      });

      // L'identité interrogée vient du JWT vérifié, pas de l'appelant.
      expect(supabase.lastQuery).toMatchObject({
        table: 'profiles',
        column: 'id',
        value: PROFILE_ID,
      });
      expect(supabase.lastQuery?.columns).toContain('user_progress(*)');
    });

    it('renvoie 404 quand le compte authentifié n’a pas de profil', async () => {
      supabase.response = { data: null, error: null };
      const token = await signToken();

      return request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
