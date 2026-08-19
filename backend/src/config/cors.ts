import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Politique CORS de l'API.
 *
 * Elle ne protège pas l'API — un client non-navigateur ignore CORS de bout en
 * bout — elle protège le *navigateur d'un utilisateur connecté* : sans elle,
 * n'importe quelle page web pourrait faire émettre des requêtes authentifiées
 * par le navigateur de la victime. D'où la liste blanche, et le refus du
 * joker : `Access-Control-Allow-Origin: *` rouvrirait exactement ce trou.
 *
 * `credentials` reste à sa valeur par défaut (`false`), et c'est volontaire :
 * l'API s'authentifie par `Authorization: Bearer`, jamais par cookie. Un
 * navigateur n'a donc aucune raison d'envoyer d'identifiant d'ambiance, et
 * l'activer étendrait la surface d'attaque sans rien apporter.
 */
export function buildCorsOptions(
  allowedOrigins: readonly string[],
): CorsOptions {
  const allowed = new Set(allowedOrigins);

  return {
    origin(origin, callback) {
      // Requête sans en-tête `Origin` : ce n'est pas un navigateur en train de
      // faire une requête inter-origine — mobile natif, curl, sonde de vie de
      // CapRover. CORS ne la concerne pas, elle passe telle quelle.
      //
      // Ce n'est pas un contournement : un attaquant peut certes omettre
      // l'en-tête, mais il le fait alors depuis son propre client, où il n'a
      // pas le jeton de la victime. Ce que CORS empêche, c'est qu'une page
      // tierce se serve du navigateur de la victime — et là, le navigateur
      // pose toujours `Origin`.
      if (origin === undefined) {
        callback(null, true);
        return;
      }

      // Refus silencieux : le middleware CORS n'écrit simplement pas
      // `Access-Control-Allow-Origin`, et c'est le navigateur qui bloque. Lever
      // une erreur ici transformerait un appel non-navigateur légitime en 500.
      callback(null, allowed.has(origin));
    },
    // Sans cette ligne, le préflet (OPTIONS) est rejoué avant chaque requête
    // inter-origine. La valeur n'est qu'une demande : Firefox la plafonne à
    // 24 h, Chrome à 2 h. Mettre 24 h revient donc à dire « le plus longtemps
    // que tu acceptes ».
    maxAge: 86_400,
  };
}
