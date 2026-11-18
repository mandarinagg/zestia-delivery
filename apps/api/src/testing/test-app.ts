import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { PRINCIPAL_RESOLVER } from '../modules/tenancy';
import { testDatabaseUrls } from './test-database';
import { TestPrincipalResolver } from './test-principal.resolver';

/**
 * App Nest completa (AppModule) conectada al Postgres de tests como `zestia_app`, con el
 * principal inyectable por cabecera de test (ver TestPrincipalResolver).
 */
export async function createTestApp(): Promise<INestApplication> {
  process.env.DATABASE_URL = testDatabaseUrls().app;
  process.env.LOG_LEVEL = 'silent';
  process.env.NODE_ENV = 'test';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_RESOLVER)
    .useClass(TestPrincipalResolver)
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}
