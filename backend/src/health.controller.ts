import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator.js';

@Controller('health')
export class HealthController {
  /** The only public route. Returns a constant — an unauthenticated oracle reports nothing. */
  @Public()
  @Get()
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
