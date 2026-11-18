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

describe('loadEnv: autenticación', () => {
  it('cookie Secure por defecto salvo en development', () => {
    expect(loadEnv({ DATABASE_URL }).SESSION_COOKIE_SECURE).toBe(false);
    expect(loadEnv({ DATABASE_URL, NODE_ENV: 'test' }).SESSION_COOKIE_SECURE).toBe(true);
    expect(loadEnv({ DATABASE_URL, NODE_ENV: 'production' }).SESSION_COOKIE_SECURE).toBe(true);
    expect(
      loadEnv({ DATABASE_URL, NODE_ENV: 'test', SESSION_COOKIE_SECURE: 'false' })
        .SESSION_COOKIE_SECURE,
    ).toBe(false);
  });

  it('no permite desactivar Secure en producción', () => {
    expect(() =>
      loadEnv({ DATABASE_URL, NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'false' }),
    ).toThrow(/SESSION_COOKIE_SECURE/);
  });

  it('valida orígenes y timeouts', () => {
    expect(
      loadEnv({ DATABASE_URL, APP_ORIGINS: 'http://a.test, https://b.test:8443' }).APP_ORIGINS,
    ).toEqual(['http://a.test', 'https://b.test:8443']);
    expect(() => loadEnv({ DATABASE_URL, APP_ORIGINS: 'http://a.test/ruta' })).toThrow(
      /APP_ORIGINS/,
    );
    expect(() =>
      loadEnv({
        DATABASE_URL,
        SESSION_IDLE_TIMEOUT_MINUTES: '120',
        SESSION_ABSOLUTE_TIMEOUT_HOURS: '1',
      }),
    ).toThrow(/SESSION_IDLE_TIMEOUT_MINUTES/);
  });

  it('SMTP_USER y SMTP_PASSWORD van juntos y la clave no se filtra', () => {
    try {
      loadEnv({ DATABASE_URL, SMTP_PASSWORD: 'smtp-s3cr3t' });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).toMatch(/SMTP_USER/);
      expect(String(error)).not.toContain('smtp-s3cr3t');
    }
  });
});
