// API pública del módulo audit. Otros módulos importan SOLO desde aquí.
export {
  UnsafeAuditEventError,
  type AuditActor,
  type AuditEvent,
  type AuditMetadata,
  type AuditMetadataValue,
} from './audit-event';
export { AuditModule } from './audit.module';
export { AuditService } from './audit.service';
