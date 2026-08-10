import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  /** Sonde de vie utilisée par le healthcheck du container CapRover. */
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
