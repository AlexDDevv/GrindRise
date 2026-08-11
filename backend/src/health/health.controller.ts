import { Controller, Get } from '@nestjs/common';

import { Public } from '../auth/public.decorator';

@Controller('health')
export class HealthController {
  /**
   * Sonde de vie utilisée par le healthcheck du container CapRover.
   *
   * `@Public()` : l'orchestrateur n'a pas d'identité utilisateur à présenter,
   * et une sonde qui répondrait 401 ferait redémarrer le container en boucle.
   * La réponse ne divulgue rien de plus que « le process répond ».
   */
  @Public()
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
