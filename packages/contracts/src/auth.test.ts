import { describe, expect, it } from 'vitest';
import {
  changePasswordRequestSchema,
  emailSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  newPasswordSchema,
  resetPasswordRequestSchema,
  switchTenantRequestSchema,
} from './index.js';

describe('contratos de autenticación', () => {
  it('normaliza el email (trim + minúsculas) y rechaza inválidos', () => {
    expect(emailSchema.parse('  Ana@Example.COM ')).toBe('ana@example.com');
    expect(emailSchema.safeParse('no-es-email').success).toBe(false);
    expect(emailSchema.safeParse(`${'a'.repeat(250)}@x.co`).success).toBe(false);
  });

  it('login: email + contraseña, sin campos extra', () => {
    expect(loginRequestSchema.parse({ email: 'A@b.co', password: 'x' })).toEqual({
      email: 'a@b.co',
      password: 'x',
    });
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
    expect(
      loginRequestSchema.safeParse({ email: 'a@b.co', password: 'x', tenantId: 'y' }).success,
    ).toBe(false);
    expect(
      loginRequestSchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(257) }).success,
    ).toBe(false);
  });

  it('política de contraseña nueva: 12 a 128 caracteres, sin reglas de composición', () => {
    expect(newPasswordSchema.safeParse('a'.repeat(11)).success).toBe(false);
    expect(newPasswordSchema.safeParse('frase larga con espacios').success).toBe(true);
    expect(newPasswordSchema.safeParse('ñandutí-guaraní-💡').success).toBe(true);
    expect(newPasswordSchema.safeParse('a'.repeat(129)).success).toBe(false);
  });

  it('reset: token base64url de 43 caracteres', () => {
    const token = 'A'.repeat(42) + '_';
    expect(resetPasswordRequestSchema.safeParse({ token, password: 'x'.repeat(12) }).success).toBe(
      true,
    );
    expect(
      resetPasswordRequestSchema.safeParse({ token: 'corto', password: 'x'.repeat(12) }).success,
    ).toBe(false);
  });

  it('switch-tenant exige UUID; forgot-password y change-password validan', () => {
    expect(switchTenantRequestSchema.safeParse({ tenantId: 'x' }).success).toBe(false);
    expect(forgotPasswordRequestSchema.safeParse({ email: 'a@b.co' }).success).toBe(true);
    expect(
      changePasswordRequestSchema.safeParse({ currentPassword: 'x', newPassword: 'corta' }).success,
    ).toBe(false);
  });
});
