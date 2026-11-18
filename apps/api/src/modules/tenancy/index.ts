// API pública del módulo tenancy. Otros módulos importan SOLO desde aquí.
export { MembershipRole } from '../../generated/prisma/enums';
export {
  PRINCIPAL_RESOLVER,
  UnauthenticatedPrincipalResolver,
  type Principal,
  type PrincipalResolver,
} from './principal';
export { TenancyModule } from './tenancy.module';
export { TenantContextMissingError, isUuid, type TenantContext } from './tenant-context';
export { TenantDb } from './tenant-db';
export { TENANT_EXEMPT, TENANT_ROLES, TENANT_SCOPED } from './tenant-metadata';
export { TenantExempt, TenantScoped, type TenantScopedOptions } from './tenant-scoped.decorator';
export type { TenantTx } from './tenant-transaction';
export { TenantGuard } from './tenant.guard';
export {
  TenantResolver,
  type MembershipSummary,
  type TenantResolution,
  type UserIdentity,
} from './tenant.resolver';
