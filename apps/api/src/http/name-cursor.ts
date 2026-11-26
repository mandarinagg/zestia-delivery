import { BadRequestException } from '@nestjs/common';

/**
 * Cursor de listados ordenados por (nombre, id): el par del último elemento en base64url,
 * opaco para el cliente. Uno que no se puede leer → `400 INVALID_CURSOR`.
 */
export function encodeNameCursor(item: { name: string; id: string }): string {
  return Buffer.from(JSON.stringify([item.name, item.id])).toString('base64url');
}

export function decodeNameCursor(cursor: string): { name: string; id: string } {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'string' &&
      /^[0-9a-f-]{36}$/i.test(value[1])
    ) {
      return { name: value[0], id: value[1] };
    }
  } catch {
    /* cae al error de abajo */
  }
  throw new BadRequestException({ statusCode: 400, code: 'INVALID_CURSOR' });
}
