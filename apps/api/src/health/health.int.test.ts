import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { createTestApp } from '../testing/test-app';
import { testDatabaseUrls } from '../testing/test-database';

describe('/health/ready contra Postgres real', () => {
  const originalUrl = process.env.DATABASE_URL;
  afterEach(() => {
    process.env.DATABASE_URL = originalUrl;
  });

  it('ok con el rol de aplicación', async () => {
    const app = await createTestApp();
    try {
      const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
      expect(res.body).toEqual({ status: 'ok', checks: { database: 'ok' } });
    } finally {
      await app.close();
    }
  });

  it.each([
    ['dueño de las tablas (migrador)', 'migrator', /TABLE_OWNER/],
    ['superusuario', 'admin', /SUPERUSER/],
  ] as const)('la API no arranca conectada como %s', async (_label, key, reason) => {
    process.env.DATABASE_URL = testDatabaseUrls()[key];
    process.env.LOG_LEVEL = 'silent';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    await expect(app.init()).rejects.toThrow(reason);
    await app.close();
  });
});
