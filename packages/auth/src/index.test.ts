import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  type Permission,
  ROLES,
  ROLE_PERMISSIONS,
  type Role,
  can,
  canAll,
  isPermission,
  isRole,
  permissionsOf,
} from './index.js';

/**
 * La matriz esperada, escrita a mano a propósito: cambiar un permiso de un rol exige cambiar
 * también esta tabla (y revisarlo en el PR). ✔ = tiene el permiso.
 */
const EXPECTED: Record<Permission, readonly Role[]> = {
  'merchants:read': ['OWNER', 'ADMIN', 'OPERATOR', 'SUPERVISOR'],
  'merchants:manage': ['OWNER', 'ADMIN'],
  'users:read': ['OWNER', 'ADMIN'],
  'users:manage': ['OWNER', 'ADMIN'],
  'users:manage-owners': ['OWNER'],
  'audit:read': ['OWNER', 'ADMIN'],
};

describe('matriz rol → permiso', () => {
  it('cubre todos los permisos', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...PERMISSIONS].sort());
  });

  for (const permission of PERMISSIONS) {
    for (const role of ROLES) {
      const expected = EXPECTED[permission].includes(role);
      it(`${role} ${expected ? 'puede' : 'no puede'} ${permission}`, () => {
        expect(can(role, permission)).toBe(expected);
      });
    }
  }

  it('no tiene permisos duplicados ni desconocidos', () => {
    for (const role of ROLES) {
      const perms = ROLE_PERMISSIONS[role];
      expect(new Set(perms).size).toBe(perms.length);
      expect(perms.every(isPermission)).toBe(true);
    }
  });

  it('Supervisor tiene al menos lo mismo que Operador (SPEC §3)', () => {
    for (const p of permissionsOf('OPERATOR')) expect(can('SUPERVISOR', p)).toBe(true);
  });

  it('solo el Propietario puede gestionar Propietarios', () => {
    expect(ROLES.filter((r) => can(r, 'users:manage-owners'))).toEqual(['OWNER']);
  });
});

describe('canAll', () => {
  it('exige todos los permisos', () => {
    expect(canAll('ADMIN', ['merchants:read', 'merchants:manage'])).toBe(true);
    expect(canAll('OPERATOR', ['merchants:read', 'merchants:manage'])).toBe(false);
  });

  it('falla cerrado con lista vacía', () => {
    expect(canAll('OWNER', [])).toBe(false);
  });
});

describe('guardas de tipo', () => {
  it('isRole', () => {
    expect(isRole('ADMIN')).toBe(true);
    expect(isRole('admin')).toBe(false);
    expect(isRole('root')).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it('isPermission', () => {
    expect(isPermission('audit:read')).toBe(true);
    expect(isPermission('audit:delete')).toBe(false);
  });

  it('un rol desconocido no tiene permisos', () => {
    expect(can('ROOT' as Role, 'merchants:read')).toBe(false);
    expect(permissionsOf('ROOT' as Role)).toEqual([]);
  });
});
