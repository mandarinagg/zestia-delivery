import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsRepository } from './audit-logs.repository';
import { AuditService } from './audit.service';

/** Auditoría append-only: escritura (`AuditService`) y consulta para Propietario/Admin (#17). */
@Module({
  imports: [TenancyModule],
  controllers: [AuditLogsController],
  providers: [AuditService, AuditLogsRepository],
  exports: [AuditService],
})
export class AuditModule {}
