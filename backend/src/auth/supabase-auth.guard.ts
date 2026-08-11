import {
  Injectable,
  Logger,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import type { AppConfig } from '../config/env.config';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from './authenticated-user';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Algorithmes acceptés, en liste blanche.
 *
 * Ce sont les deux familles de clés de signature émises par Supabase (ECC
 * P-256 et RSA 2048). Les nommer explicitement ferme l'attaque par confusion
 * d'algorithme : sans cette contrainte, un attaquant peut resigner un jeton en
 * HS256 en utilisant la clé *publique* — qui est publiée — comme secret
 * partagé, et la vérification passerait.
 */
const ALLOWED_ALGORITHMS = ['ES256', 'RS256'];

/**
 * Vérifie le JWT Supabase porté par `Authorization: Bearer <jwt>`.
 *
 * La signature est validée **localement** contre le JWKS public du projet.
 * L'alternative (`supabase.auth.getUser(token)`) ajouterait un aller-retour
 * réseau de 50 à 150 ms à chaque requête protégée et ferait tomber l'API avec
 * Supabase Auth. `createRemoteJWKSet` met les clés en cache et ne refait un
 * appel que sur un `kid` inconnu, donc sur rotation.
 *
 * Contrepartie assumée : un jeton révoqué reste accepté jusqu'à son
 * expiration (1 h par défaut). La corriger, c'est reprendre l'aller-retour
 * réseau qu'on vient d'écarter — à ne rouvrir que si une déconnexion à effet
 * immédiat devient un besoin réel.
 *
 * Ce guard ne touche jamais la base : vérifier que le profil existe coûterait
 * une requête par appel pour re-prouver ce que le trigger sur `auth.users`
 * garantit déjà à la création du compte.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);
  private readonly issuer: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService<AppConfig, true>,
  ) {
    // La barre finale est tolérée dans la variable d'environnement mais
    // produirait un `issuer` en double barre, qui ne correspondrait à aucun
    // jeton.
    const supabaseUrl = config
      .get('supabaseUrl', { infer: true })
      .replace(/\/+$/, '');

    this.issuer = `${supabaseUrl}/auth/v1`;
    this.jwks = createRemoteJWKSet(
      new URL(`${this.issuer}/.well-known/jwks.json`),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);

    if (token === null) {
      throw new UnauthorizedException(
        'En-tête Authorization: Bearer manquant.',
      );
    }

    request.user = await this.authenticate(token);
    return true;
  }

  private async authenticate(token: string): Promise<AuthenticatedUser> {
    let payload: JWTPayload;

    try {
      ({ payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: 'authenticated',
        algorithms: ALLOWED_ALGORITHMS,
      }));
    } catch (error) {
      // Le motif exact (signature, expiration, émetteur) reste dans les logs :
      // le renvoyer à l'appelant n'aide que celui qui teste des jetons forgés.
      this.logger.debug(
        `JWT rejeté : ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException("Jeton d'accès invalide ou expiré.");
    }

    // Un jeton signé par le bon projet n'est pas pour autant celui d'un
    // utilisateur : la clé `anon` porte le rôle `anon`.
    if (payload.role !== 'authenticated') {
      this.logger.debug(
        `JWT rejeté : rôle inattendu (${String(payload.role)}).`,
      );
      throw new UnauthorizedException("Jeton d'accès invalide ou expiré.");
    }

    if (typeof payload.sub !== 'string' || payload.sub === '') {
      this.logger.debug('JWT rejeté : claim `sub` absente.');
      throw new UnauthorizedException("Jeton d'accès invalide ou expiré.");
    }

    return {
      id: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
    };
  }
}

/** Renvoie le jeton, ou `null` si l'en-tête est absent ou mal formé. */
function extractBearerToken(header: string | undefined): string | null {
  if (header === undefined) {
    return null;
  }

  const [scheme, token, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0) {
    return null;
  }

  return token;
}
