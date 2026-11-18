import { argon2Sync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ARGON2_PARAMS,
  hashPassword,
  needsRehash,
  parsePasswordHash,
  verifyPassword,
} from './password-hashing';

describe('Argon2id (node:crypto)', () => {
  it('el runtime implementa Argon2id según el vector de prueba de RFC 9106 §5.3', () => {
    const tag = argon2Sync('argon2id', {
      message: Buffer.alloc(32, 1),
      nonce: Buffer.alloc(16, 2),
      secret: Buffer.alloc(8, 3),
      associatedData: Buffer.alloc(12, 4),
      parallelism: 4,
      tagLength: 32,
      memory: 32,
      passes: 3,
    });
    expect(tag.toString('hex')).toBe(
      '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659',
    );
  });

  it('hash en formato PHC con los parámetros actuales y salt aleatorio', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/);
    expect(a).not.toBe(b);
    expect(parsePasswordHash(a)).toMatchObject(ARGON2_PARAMS);
  });

  it('verifica la contraseña correcta y rechaza otras', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword(hash, 'correct horse battery')).toBe(true);
    expect(await verifyPassword(hash, 'correct horse batter')).toBe(false);
    expect(await verifyPassword(hash, 'Correct horse battery')).toBe(false);
  });

  it('normaliza Unicode (NFKC): la misma contraseña con otra composición verifica', async () => {
    const composed = 'contraseña-ñandú'; // ñ y ú precompuestas
    const decomposed = composed.normalize('NFD');
    expect(decomposed).not.toBe(composed);
    expect(await verifyPassword(await hashPassword(composed), decomposed)).toBe(true);
  });

  it('un hash mal formado o con parámetros fuera de rango nunca verifica', async () => {
    expect(await verifyPassword('', 'x')).toBe(false);
    expect(await verifyPassword('$2b$10$abcdefghijklmnopqrstuv', 'x')).toBe(false);
    const hash = await hashPassword('x');
    const huge = hash.replace('m=19456', 'm=99999999');
    expect(parsePasswordHash(huge)).toBeNull();
    expect(await verifyPassword(huge, 'x')).toBe(false);
    expect(parsePasswordHash(hash.replace('v=19', 'v=16'))).toBeNull();
    expect(parsePasswordHash(hash.replace('argon2id', 'argon2i'))).toBeNull();
  });

  it('needsRehash detecta parámetros viejos', async () => {
    const current = await hashPassword('x');
    const old = await hashPassword('x', { memory: 8192, passes: 1, parallelism: 1 });
    expect(needsRehash(current)).toBe(false);
    expect(needsRehash(old)).toBe(true);
    expect(await verifyPassword(old, 'x')).toBe(true);
  });
});
