import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const DATABASE_URL = 'postgresql://zestia_app:x@localhost:5432/zestia';

describe('loadEnv', () => {
  it('aplica valores por defecto', () => {
    expect(loadEnv({ DATABASE_URL })).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_POOL_MAX: 10,
    });
  });

  it('falla con valores inválidos', () => {
    expect(() => loadEnv({ DATABASE_URL, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('exige DATABASE_URL y no filtra su valor en el error', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    try {
      loadEnv({ DATABASE_URL: 'mysql://user:s3cr3t@host/db' });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).toMatch(/DATABASE_URL/);
      expect(String(error)).not.toContain('s3cr3t');
    }
  });
});
