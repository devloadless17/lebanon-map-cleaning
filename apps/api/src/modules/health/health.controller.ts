import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/auth.guard.js';

@Controller('health')
export class HealthController {
  /**
   * Cheap liveness only: no database round trip and no external call.
   *
   * A readiness probe here would bill external services on every container healthcheck and
   * would fail the deploy gate on a transient provider blip.
   */
  @Public()
  @Get()
  check(): { status: 'ok'; uptime: number } {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }
}
