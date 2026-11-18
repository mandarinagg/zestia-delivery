import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { loadEnv } from '../config/env';
import { configureHttpApp } from '../http/configure-app';
import { MAIL_TRANSPORT } from '../modules/mail';
import { PRINCIPAL_RESOLVER } from '../modules/tenancy';
import { CapturingMailTransport } from './capturing-mail.transport';
import { testDatabaseUrls } from './test-database';
import { TestPrincipalResolver } from './test-principal.resolver';

/** Origen web permitido en los tests (APP_ORIGINS). */
export const TEST_WEB_ORIGIN = 'http://web.test';

export interface TestAppOptions {
  /**
   * `test-principal` (por defecto): principal inyectado por cabecera (`TestPrincipalResolver`).
   * `session`: autenticación REAL por cookie de sesión (`SessionPrincipalResolver`).
   */
  readonly auth?: 'test-principal' | 'session';
  /** Variables de entorno extra (p. ej. límites de rate limit). Solo durante el arranque. */
  readonly env?: Readonly<Record<string, string>>;
}

export interface TestApp extends INestApplication {
  readonly mail: CapturingMailTransport;
}

/**
 * App Nest completa (AppModule) conectada al Postgres de tests como `zestia_app`. El email
 * siempre se captura en memoria (nunca SMTP).
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const env: Record<string, string> = {
    DATABASE_URL: testDatabaseUrls().app,
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
    APP_ORIGINS: TEST_WEB_ORIGIN,
    WEB_BASE_URL: TEST_WEB_ORIGIN,
    // Todos los tests llegan desde 127.0.0.1 a la misma DB: el límite por IP se prueba aparte
    // (auth-rate-limit.int.test.ts, con IPs distintas vía X-Forwarded-For).
    LOGIN_RATE_MAX_PER_IP: '10000',
    PASSWORD_RESET_RATE_MAX_PER_IP: '10000',
    ...options.env,
  };
  const saved = new Map(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  try {
    const mail = new CapturingMailTransport();
    let builder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAIL_TRANSPORT)
      .useValue(mail);
    if ((options.auth ?? 'test-principal') === 'test-principal') {
      builder = builder.overrideProvider(PRINCIPAL_RESOLVER).useClass(TestPrincipalResolver);
    }
    const moduleRef = await builder.compile();
    const app = moduleRef.createNestApplication();
    configureHttpApp(app, loadEnv());
    await app.init();
    return Object.assign(app, { mail });
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
