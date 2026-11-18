import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantExempt } from '../modules/tenancy';

type ReadyBody = { status: 'ok' | 'error'; checks: { database: string } };

@Controller('health')
@TenantExempt('healthchecks públicos, sin datos de negocio')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Lista para recibir tráfico: la DB responde y la conexión usa un rol que no puede
   * saltearse RLS. No expone detalles (rol, host, errores): solo el estado.
   */
  @Get('ready')
  async ready(): Promise<ReadyBody> {
    const check = await this.prisma.checkConnectionRole();
    if (check.status !== 'ok') {
      throw new ServiceUnavailableException({
        status: 'error',
        checks: { database: check.status },
      } satisfies ReadyBody);
    }
    return { status: 'ok', checks: { database: 'ok' } };
  }
}
