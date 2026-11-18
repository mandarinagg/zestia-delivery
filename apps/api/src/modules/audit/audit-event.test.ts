import { describe, expect, it } from 'vitest';
import {
  type AuditEvent,
  UnsafeAuditEventError,
  assertSafeAuditEvent,
  safeCorrelationId,
} from './audit-event';

const base: AuditEvent = {
  action: 'auth.login.failed',
  actor: { type: 'ANONYMOUS' },
  entity: { type: 'user', id: '0192f0c4-0000-7000-8000-000000000001' },
  metadata: { reason: 'BAD_PASSWORD', paramsUpgraded: false, attempts: 3, note: null },
};

describe('assertSafeAuditEvent', () => {
  it('acepta un evento válido', () => {
    expect(() => assertSafeAuditEvent(base)).not.toThrow();
  });

  it.each([
    ['acción sin dominio', { ...base, action: 'login' }],
    ['acción con mayúsculas', { ...base, action: 'Auth.Login' }],
    ['email como id de entidad', { ...base, entity: { type: 'user', id: 'ana@example.com' } }],
    ['clave con email', { ...base, metadata: { email: 'x' } }],
    ['clave que contiene password', { ...base, metadata: { newPasswordLength: 12 } }],
    ['clave con token', { ...base, metadata: { resetToken: 'abc' } }],
    ['clave con cookie', { ...base, metadata: { sessionCookie: 'x' } }],
    ['valor con @', { ...base, metadata: { reason: 'ana@example.com' } }],
    ['valor demasiado largo', { ...base, metadata: { reason: 'x'.repeat(201) } }],
    ['metadata anidada', { ...base, metadata: { nested: { a: 1 } as unknown as string } }],
    ['número no finito', { ...base, metadata: { n: Number.NaN } }],
    ['actor USER con id inválido', { ...base, actor: { type: 'USER', id: 'a b' } as const }],
  ])('rechaza %s', (_label, event) => {
    expect(() => assertSafeAuditEvent(event as AuditEvent)).toThrow(UnsafeAuditEventError);
  });
});

describe('safeCorrelationId', () => {
  it('conserva ids seguros y descarta el resto', () => {
    expect(safeCorrelationId('0192f0c4-aaaa')).toBe('0192f0c4-aaaa');
    expect(safeCorrelationId('con espacios')).toBeNull();
    expect(safeCorrelationId('x'.repeat(129))).toBeNull();
    expect(safeCorrelationId(undefined)).toBeNull();
  });
});
