import { describe, expect, it } from 'vitest';
import { auditDiff } from './audit-diff';
import { assertSafeAuditEvent } from './audit-event';

interface Merchant {
  name: string;
  status: string;
  phone: string | null;
  ruc: string | null;
  deletedAt: Date | null;
  internalNotes: string;
}

const spec = {
  fields: ['name', 'status', 'deletedAt'],
  redacted: ['phone', 'ruc'],
} as const satisfies { fields: (keyof Merchant)[]; redacted: (keyof Merchant)[] };

const base: Merchant = {
  name: 'La Esquina',
  status: 'ACTIVE',
  phone: '0981 000 000',
  ruc: '80000000-1',
  deletedAt: null,
  internalNotes: 'no auditado',
};

describe('auditDiff', () => {
  it('solo devuelve los campos que cambiaron', () => {
    expect(auditDiff(base, { ...base, name: 'La Esquina 2' }, spec)).toEqual({
      name: { from: 'La Esquina', to: 'La Esquina 2' },
    });
  });

  it('null si no cambió nada auditado (los campos fuera de la lista no cuentan)', () => {
    expect(auditDiff(base, { ...base, internalNotes: 'otra cosa' }, spec)).toBeNull();
  });

  it('datos personales: marca el cambio sin guardar el valor', () => {
    const changes = auditDiff(base, { ...base, phone: '0982 111 111', ruc: null }, spec);
    expect(changes).toEqual({ phone: { redacted: true }, ruc: { redacted: true } });
    expect(JSON.stringify(changes)).not.toContain('0982');
    expect(JSON.stringify(changes)).not.toContain('80000000');
  });

  it('alta: from null en los campos con valor', () => {
    expect(auditDiff(null, base, spec)).toEqual({
      name: { from: null, to: 'La Esquina' },
      status: { from: null, to: 'ACTIVE' },
      phone: { redacted: true },
      ruc: { redacted: true },
    });
  });

  it('baja lógica: fechas en ISO 8601 UTC', () => {
    const deletedAt = new Date('2026-11-18T15:00:00.000Z');
    expect(auditDiff(base, { ...base, deletedAt }, spec)).toEqual({
      deletedAt: { from: null, to: '2026-11-18T15:00:00.000Z' },
    });
  });

  it('rechaza valores no planos', () => {
    expect(() =>
      auditDiff(
        { name: 'a' },
        { name: { nested: true } as unknown as string },
        { fields: ['name'] },
      ),
    ).toThrow(/valor plano/);
  });

  it('el resultado pasa la validación de seguridad del evento', () => {
    const changes = auditDiff(null, base, spec);
    expect(() =>
      assertSafeAuditEvent({
        action: 'merchants.created',
        actor: { type: 'SYSTEM' },
        entity: { type: 'merchant', id: 'm1' },
        changes,
      }),
    ).not.toThrow();
  });
});
