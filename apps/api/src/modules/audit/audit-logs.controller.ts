import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  type AuditLogEntry,
  type AuditLogPage,
  type AuditLogQuery,
  auditLogQuerySchema,
} from '@zestia/contracts';
import { ZodValidationPipe } from '../../http/zod-validation.pipe';
import { RequirePermission, TenantScoped } from '../tenancy';
import { AuditLogsRepository } from './audit-logs.repository';

/** Consulta de la auditoría del tenant activo (Propietario/Admin, `audit:read`). Solo lectura. */
@Controller('api/v1/audit-logs')
@TenantScoped()
@RequirePermission('audit:read')
export class AuditLogsController {
  constructor(private readonly logs: AuditLogsRepository) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery,
  ): Promise<AuditLogPage> {
    return this.logs.list(query);
  }

  @Get(':id')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<AuditLogEntry> {
    const entry = await this.logs.findById(id);
    // Inexistente y "de otro tenant" son indistinguibles: siempre 404.
    if (!entry) throw new NotFoundException();
    return entry;
  }
}
