import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { type DatabaseRoleCheck, PrismaService } from '../database/prisma.service';
import { HealthController } from './health.controller';

async function appWith(check: DatabaseRoleCheck): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: PrismaService, useValue: { checkConnectionRole: async () => check } }],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
}

describe('GET /health', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('/health/live responde ok sin consultar la DB', async () => {
    app = await appWith({ status: 'down' });
    const res = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('/health/ready responde ok si la DB responde con un rol seguro', async () => {
    app = await appWith({ status: 'ok' });
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ok', checks: { database: 'ok' } });
  });

  it('/health/ready responde 503 si la DB no responde', async () => {
    app = await appWith({ status: 'down' });
    const res = await request(app.getHttpServer()).get('/health/ready').expect(503);
    expect(res.body).toEqual({ status: 'error', checks: { database: 'down' } });
  });

  it('/health/ready responde 503 si el rol puede saltearse RLS, sin detallar el motivo', async () => {
    app = await appWith({ status: 'insecure_role', reasons: ['BYPASSRLS'] });
    const res = await request(app.getHttpServer()).get('/health/ready').expect(503);
    expect(res.body).toEqual({ status: 'error', checks: { database: 'insecure_role' } });
  });
});
