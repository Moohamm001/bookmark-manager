import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator.js';

@Controller('health')
export class HealthController {
  /**
   * The ONLY public route in the app. It returns a constant — no counts, no version, no
   * database state — because an unauthenticated endpoint that reports anything about the
   * data is a free oracle.
   */
  @Public()
  @Get()
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
