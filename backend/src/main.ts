import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import type { AppConfig } from './config/env.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);

  const config = app.get(ConfigService<AppConfig, true>);

  // 0.0.0.0 : indispensable pour être joignable depuis l'extérieur du container.
  await app.listen(config.get('port', { infer: true }), '0.0.0.0');
}

void bootstrap();
