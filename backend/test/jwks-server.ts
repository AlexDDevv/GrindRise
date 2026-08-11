import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { JWK } from 'jose';

export type JwksServer = {
  /** Racine à donner à `SUPABASE_URL`, sans barre finale. */
  url: string;
  close: () => Promise<void>;
};

/**
 * Sert un JWKS au même chemin que Supabase : `/auth/v1/.well-known/jwks.json`.
 *
 * Permet aux tests d'exercer le vrai chemin de vérification du guard —
 * `createRemoteJWKSet` va réellement chercher la clé, en HTTP — sans réseau ni
 * projet Supabase, donc sans secret ni dépendance externe dans la CI.
 *
 * Toute autre route répond 404 : si le guard interrogeait une URL inattendue,
 * le test échouerait au lieu de passer par accident.
 */
export function startJwksServer(...keys: JWK[]): Promise<JwksServer> {
  const server: Server = createServer((req, res) => {
    if (req.url === '/auth/v1/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys }));
      return;
    }

    res.writeHead(404).end();
  });

  return new Promise((resolve) => {
    // Port 0 : le noyau en attribue un libre, deux fichiers de test peuvent
    // donc tourner en parallèle sans se marcher dessus.
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;

      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((done, fail) =>
            server.close((error) => (error ? fail(error) : done())),
          ),
      });
    });
  });
}
