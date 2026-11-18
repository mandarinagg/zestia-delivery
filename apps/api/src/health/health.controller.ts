import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Por ahora siempre ok; el chequeo de DB se agrega con la persistencia (issue #15). */
  @Get('ready')
  ready(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
