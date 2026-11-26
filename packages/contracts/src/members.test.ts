import { describe, expect, it } from 'vitest';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  memberListQuerySchema,
  updateMemberSchema,
} from './members.js';

const TOKEN = 'a'.repeat(43);

describe('createInvitationSchema', () => {
  it('normaliza el email', () => {
    expect(createInvitationSchema.parse({ email: '  Ana@Ejemplo.COM ', role: 'ADMIN' })).toEqual({
      email: 'ana@ejemplo.com',
      role: 'ADMIN',
    });
  });

  it('rechaza emails inválidos con mensaje en castellano', () => {
    const result = createInvitationSchema.safeParse({ email: 'no-es-un-email', role: 'ADMIN' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Ingresá un correo válido.');
  });

  it('solo roles asignables en R1 (sin Repartidor ni Comercio)', () => {
    for (const role of ['OWNER', 'ADMIN', 'OPERATOR', 'SUPERVISOR']) {
      expect(createInvitationSchema.safeParse({ email: 'a@b.co', role }).success, role).toBe(true);
    }
    for (const role of ['COURIER', 'MERCHANT', 'ROOT']) {
      expect(createInvitationSchema.safeParse({ email: 'a@b.co', role }).success, role).toBe(false);
    }
  });

  it('no acepta campos extra (tenant, token)', () => {
    expect(
      createInvitationSchema.safeParse({ email: 'a@b.co', role: 'ADMIN', tenantId: 'x' }).success,
    ).toBe(false);
  });
});

describe('updateMemberSchema', () => {
  it('solo el rol, y solo asignables', () => {
    expect(updateMemberSchema.safeParse({ role: 'OPERATOR' }).success).toBe(true);
    expect(updateMemberSchema.safeParse({ role: 'COURIER' }).success).toBe(false);
    expect(updateMemberSchema.safeParse({ role: 'OPERATOR', status: 'ACTIVE' }).success).toBe(
      false,
    );
  });
});

describe('acceptInvitationSchema', () => {
  it('token solo (cuenta existente) o con nombre y contraseña', () => {
    expect(acceptInvitationSchema.safeParse({ token: TOKEN }).success).toBe(true);
    expect(
      acceptInvitationSchema.parse({ token: TOKEN, name: '  Ana  ', password: 'x'.repeat(12) }),
    ).toEqual({ token: TOKEN, name: 'Ana', password: 'x'.repeat(12) });
  });

  it('rechaza tokens con formato inválido y contraseñas cortas', () => {
    expect(acceptInvitationSchema.safeParse({ token: 'corto' }).success).toBe(false);
    expect(acceptInvitationSchema.safeParse({ token: TOKEN, password: 'corta' }).success).toBe(
      false,
    );
  });
});

describe('memberListQuerySchema', () => {
  it('límite por defecto y máximo', () => {
    expect(memberListQuerySchema.parse({}).limit).toBe(50);
    expect(memberListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});
