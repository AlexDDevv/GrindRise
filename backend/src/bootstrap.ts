import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { buildCorsOptions } from './config/cors';
import type { AppConfig } from './config/env.config';

/**
 * Réglages transverses de l'application HTTP.
 *
 * Extraits de `main.ts` pour une raison précise : les tests de bout en bout
 * construisent l'application par `Test.createTestingModule(...)`, qui ne passe
 * jamais par `bootstrap()`. Tout ce qui resterait dans `main.ts` ne serait donc
 * vérifié par aucun test — et une politique CORS est exactement le genre de
 * réglage dont on veut la preuve, pas la relecture.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = app.get(ConfigService<AppConfig, true>);

  app.enableCors(
    buildCorsOptions(config.get('corsAllowedOrigins', { infer: true })),
  );
}
