/** Matriz rol → permisos (esqueleto; se completa en el issue de auth). */
export const ROLES = ['admin', 'operator', 'merchant', 'courier'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
