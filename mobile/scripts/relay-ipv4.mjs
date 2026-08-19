// Relais IPv4 -> IPv6 devant Metro, pour l'émulateur Android sous WSL2.
//
// Sous WSL2, Metro n'ouvre son port qu'en IPv6 (`ss -4 -ltn` ne montre rien sur
// 8081, `ss -6 -ltn` si). Windows atteint quand même le serveur via `localhost`,
// qui se résout en `::1` — mais `adb reverse` se connecte en IPv4 sur
// `127.0.0.1`, et échoue donc silencieusement. Expo Go affiche alors
// « Something went wrong » sans que Metro ait vu passer la moindre requête,
// ce qui ressemble à un problème de projet plutôt qu'à un problème de réseau.
//
// Ce relais écoute en IPv4 sur un port voisin et repasse tout à Metro en IPv6.
// La redirection devient `adb reverse tcp:8081 tcp:8082`, et l'émulateur
// atteint Metro par `exp://localhost:8081`.
//
//   node scripts/relay-ipv4.mjs [port_ecoute] [port_metro]
//
// Inutile hors WSL2 : un Metro qui écoute déjà en IPv4 se redirige
// directement avec `adb reverse tcp:8081 tcp:8081`.

import { createServer, connect } from 'node:net';

const LISTEN = Number(process.argv[2] ?? 8082);
const TARGET = Number(process.argv[3] ?? 8081);

const server = createServer((client) => {
  const upstream = connect({ host: '::1', port: TARGET });

  client.pipe(upstream).pipe(client);

  // Une extrémité qui tombe doit emporter l'autre : sans ça, un rechargement
  // de l'app laisse des sockets à demi ouvertes qui s'accumulent.
  const drop = () => {
    client.destroy();
    upstream.destroy();
  };

  client.on('error', drop);
  upstream.on('error', drop);
});

server.on('error', (error) => {
  console.error(`[relais] impossible d'écouter sur ${LISTEN} :`, error.message);
  process.exit(1);
});

server.listen(LISTEN, '0.0.0.0', () => {
  console.log(`[relais] IPv4 0.0.0.0:${LISTEN} -> [::1]:${TARGET}`);
  console.log(`[relais] puis : adb reverse tcp:${TARGET} tcp:${LISTEN}`);
});
