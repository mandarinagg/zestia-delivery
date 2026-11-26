import type { Env } from '../../config/env';
import type { RateLimitPolicy } from './auth.repository';

/** Configuración de autenticación derivada del entorno (ver config/env.ts y .env.example). */
export interface AuthSettings {
  readonly cookieSecure: boolean;
  readonly idleSeconds: number;
  readonly absoluteSeconds: number;
  readonly allowedOrigins: ReadonlySet<string>;
  readonly webBaseUrl: string;
  readonly loginRateLimit: RateLimitPolicy;
  /** El cambio de contraseña usa la misma política que el login, por usuario. */
  readonly changePasswordRateLimit: RateLimitPolicy;
  readonly resetRateLimit: RateLimitPolicy;
  readonly resetTtlSeconds: number;
}

export const AUTH_SETTINGS = Symbol('AUTH_SETTINGS');

export function authSettingsFromEnv(env: Env): AuthSettings {
  const loginRateLimit = {
    windowSeconds: env.LOGIN_RATE_WINDOW_MINUTES * 60,
    maxPerAccount: env.LOGIN_RATE_MAX_PER_ACCOUNT,
    maxPerIp: env.LOGIN_RATE_MAX_PER_IP,
  };
  return {
    cookieSecure: env.SESSION_COOKIE_SECURE,
    idleSeconds: env.SESSION_IDLE_TIMEOUT_MINUTES * 60,
    absoluteSeconds: env.SESSION_ABSOLUTE_TIMEOUT_HOURS * 3600,
    allowedOrigins: new Set(env.APP_ORIGINS),
    webBaseUrl: env.WEB_BASE_URL,
    loginRateLimit,
    changePasswordRateLimit: loginRateLimit,
    resetRateLimit: {
      windowSeconds: env.PASSWORD_RESET_RATE_WINDOW_MINUTES * 60,
      maxPerAccount: env.PASSWORD_RESET_RATE_MAX_PER_ACCOUNT,
      maxPerIp: env.PASSWORD_RESET_RATE_MAX_PER_IP,
    },
    resetTtlSeconds: env.PASSWORD_RESET_TTL_MINUTES * 60,
  };
}
