import { supabase } from './supabase';
import { env, isApiConfigured } from './env';
import { useUserStore } from '../store/userStore';

/**
 * Client de l'API NestJS.
 *
 * Ce qui passe par ici plutôt que par Supabase : tout ce qui a une valeur de
 * jeu. L'XP n'est jamais envoyée par le client, elle est déduite d'une séance
 * par le serveur — c'est pour ça qu'il existe un second chemin réseau alors que
 * le mobile parle déjà à Postgres.
 *
 * Le jeton vient de `useUserStore`, seule source de vérité de la session côté
 * mobile. Le lire là plutôt que d'appeler `supabase.auth.getSession()` évite
 * qu'un écran affiche une session et que la requête en utilise une autre.
 */

/** Erreur portant le statut HTTP, pour distinguer un 400 métier d'une panne. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
};

/**
 * Message d'erreur lisible par un humain.
 *
 * Nest renvoie `message` en tableau quand la validation échoue sur plusieurs
 * champs, en chaîne sinon. Les deux formes arrivent ici.
 */
function readErrorMessage(payload: unknown, status: number): string {
  if (typeof payload === 'object' && payload !== null && 'message' in payload) {
    const { message } = payload as { message: unknown };

    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }

  return `La requête a échoué (${status}).`;
}

async function send(
  path: string,
  accessToken: string,
  { method = 'GET', body }: RequestOptions,
): Promise<{ status: number; payload: unknown }> {
  const response = await fetch(`${env.apiUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Un 204 ou une passerelle en panne peuvent répondre sans corps JSON :
  // `response.json()` lèverait alors une erreur de parsing qui masquerait le
  // vrai statut.
  const text = await response.text();
  const payload: unknown = text === '' ? null : safeParse(text);

  return { status: response.status, payload };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

/**
 * Appelle l'API avec le jeton courant, en le rafraîchissant une fois sur 401.
 *
 * Le rafraîchissement est nécessaire malgré `autoRefreshToken` : celui-ci ne
 * tourne qu'app au premier plan, donc un retour d'arrière-plan peut se faire
 * avec un jeton expiré depuis quelques secondes. Une seule reprise, sinon un
 * jeton définitivement invalide ferait boucler la requête.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  if (!isApiConfigured) {
    throw new ApiError(
      0,
      "L'API n'est pas configurée (EXPO_PUBLIC_API_URL). Séance non enregistrée.",
    );
  }

  const token = useUserStore.getState().session?.access_token;
  if (!token) {
    throw new ApiError(401, 'Session expirée. Reconnecte-toi.');
  }

  let { status, payload } = await send(path, token, options);

  if (status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) {
      ({ status, payload } = await send(path, refreshed, options));
    }
  }

  if (status >= 400) {
    throw new ApiError(status, readErrorMessage(payload, status));
  }

  return payload as T;
}

/**
 * Renouvelle la session et la republie dans le store.
 *
 * Le store doit être mis à jour, pas seulement la requête en cours : sans ça,
 * l'appel suivant repartirait avec le jeton périmé et déclencherait un
 * rafraîchissement à chaque fois.
 *
 * @returns le nouveau jeton, ou `null` si la session est définitivement perdue.
 */
async function refreshSession(): Promise<string | null> {
  const { data, error } = await supabase.auth.refreshSession();

  if (error || !data.session) {
    console.warn('[api] rafraîchissement de session impossible :', error?.message);
    return null;
  }

  useUserStore.getState().setSession(data.session);
  return data.session.access_token;
}
