import { describe, expect, it } from 'vitest';
import { AUDIT_PAGE_DEFAULT, auditLogQuerySchema } from './audit.js';

describe('auditLogQuerySchema', () => {
  it('aplica el límite por defecto y convierte el límite de la query', () => {
    expect(auditLogQuerySchema.parse({}).limit).toBe(AUDIT_PAGE_DEFAULT);
    expect(auditLogQuerySchema.parse({ limit: '10' }).limit).toBe(10);
  });

  it('ignora parámetros desconocidos (el tenant nunca viene del cliente)', () => {
    expect(auditLogQuerySchema.parse({ tenantId: 'x' })).not.toHaveProperty('tenantId');
  });

  it.each([
    { limit: '0' },
    { limit: '101' },
    { action: 'Merchants' },
    { action: 'merchants.' },
    { entityType: 'merchant;drop' },
    { entityId: 'a b' },
    { actorId: 'no-uuid' },
    { cursor: 'no-uuid' },
    { from: '2026-11-18' },
  ])('rechaza %o', (query) => {
    expect(auditLogQuerySchema.safeParse(query).success).toBe(false);
  });

  it('acepta filtros válidos', () => {
    expect(
      auditLogQuerySchema.safeParse({
        action: 'merchants.updated',
        entityType: 'merchant',
        entityId: '0192f0c4-0000-7000-8000-000000000001',
        from: '2026-11-18T00:00:00-03:00',
        to: '2026-11-19T00:00:00Z',
      }).success,
    ).toBe(true);
  });
});
