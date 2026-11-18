/**
 * Lógica de dominio pura. PROHIBIDO importar frameworks (NestJS, Express),
 * DB/ORM (Prisma, pg) o cualquier I/O: se testea sin infraestructura.
 */

/** Los montos son enteros en la unidad mínima de la moneda (ADR-007). */
export function isValidAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
