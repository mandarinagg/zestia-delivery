import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy';
import { AuditService } from './audit.service';

/** Auditoría append-only (mínima en #14; ver audit.service.ts). */
@Module({
  imports: [TenancyModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
