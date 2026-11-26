import type { INestApplication } from '@nestjs/common';
import type { Env } from '../config/env';

interface ExpressLike {
  set(setting: string, value: unknown): void;
  disable(setting: string): void;
}

/**
 * Ajustes HTTP comunes a la app real (main.ts) y a la de tests (createTestApp):
 *  - `trust proxy`: cuántos proxies se consideran confiables para `req.ip` (rate limit por IP).
 *    Con 0 se usa la IP del socket y se ignora `X-Forwarded-For` (un cliente podría falsearla).
 *  - sin cabecera `X-Powered-By`.
 */
export function configureHttpApp(app: INestApplication, env: Env): void {
  const express = app.getHttpAdapter().getInstance() as ExpressLike;
  express.set('trust proxy', env.TRUST_PROXY_HOPS === 0 ? false : env.TRUST_PROXY_HOPS);
  express.disable('x-powered-by');
}
