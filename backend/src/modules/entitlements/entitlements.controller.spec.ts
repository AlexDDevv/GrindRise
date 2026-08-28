import { NotImplementedException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../config/env.config';
import { EntitlementsController } from './entitlements.controller';
import type { EntitlementsService } from './entitlements.service';

const SECRET = 'secret-partage-de-revenuecat';

const CORPS = {
  api_version: '1.0',
  event: {
    type: 'INITIAL_PURCHASE',
    app_user_id: '3f8b1c2e-6d4a-4f1b-9c7e-2a5d8e0b4f16',
    event_timestamp_ms: 1_756_000_000_000,
    expiration_at_ms: 1_758_000_000_000,
  },
};

function monter(secret: string | undefined) {
  const appliques: unknown[] = [];

  const service = {
    applyRevenueCatEvent: (event: unknown) => {
      appliques.push(event);
      return Promise.resolve();
    },
  } as unknown as EntitlementsService;

  const config = {
    get: () => secret,
  } as unknown as ConfigService<AppConfig, true>;

  return { appliques, controller: new EntitlementsController(service, config) };
}

describe('POST /webhooks/revenuecat', () => {
  it('reste en 501 tant que le secret n’est pas configuré', async () => {
    // Une route de webhook non protégée ne doit jamais devenir écrivable par
    // accident : sans secret, il n'y a rien pour distinguer RevenueCat d'un
    // inconnu.
    const { controller, appliques } = monter(undefined);

    await expect(controller.handleRevenueCat(SECRET, CORPS)).rejects.toBeInstanceOf(
      NotImplementedException,
    );
    expect(appliques).toHaveLength(0);
  });

  it('refuse une signature absente ou fausse', async () => {
    const { controller, appliques } = monter(SECRET);

    await expect(controller.handleRevenueCat(undefined, CORPS)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(controller.handleRevenueCat('faux', CORPS)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(appliques).toHaveLength(0);
  });

  it('applique l’événement quand la signature est bonne', async () => {
    const { controller, appliques } = monter(SECRET);

    await expect(controller.handleRevenueCat(SECRET, CORPS)).resolves.toEqual({
      received: true,
    });
    expect(appliques).toHaveLength(1);
  });

  it('répond 200 sans écrire sur un corps illisible', async () => {
    // Un corps malformé ne se répare pas par un rejeu : répondre autre chose
    // que 200 ferait boucler RevenueCat sur un événement définitivement mort.
    const { controller, appliques } = monter(SECRET);

    await expect(controller.handleRevenueCat(SECRET, { rien: true })).resolves.toEqual({
      received: true,
    });
    expect(appliques).toHaveLength(0);
  });
});
