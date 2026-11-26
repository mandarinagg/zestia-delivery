// API pública del módulo audit. Otros módulos importan SOLO desde aquí.
export { auditDiff, type AuditFieldSpec } from './audit-diff';
export {
  UnsafeAuditEventError,
  type AuditActor,
  type AuditChanges,
  type AuditFieldChange,
  type AuditEvent,
  type AuditMetadata,
  type AuditMetadataValue,
} from './audit-event';
export { AuditModule } from './audit.module';
export { AuditService, type AuditChangeEvent } from './audit.service';
