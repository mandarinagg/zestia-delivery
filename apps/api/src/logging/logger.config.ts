import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';
import type { Env } from '../config/env';

/**
 * Campos que nunca deben llegar a los logs (secretos y PII).
 * Cubre cabeceras, cuerpos de request/response y objetos anidados un nivel.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-signature"]',
  'res.headers["set-cookie"]',
  'req.body',
  'res.body',
  ...[
    'password',
    'passwordHash',
    'token',
    'accessToken',
    'refreshToken',
    'secret',
    'apiKey',
    'authorization',
    'email',
    'phone',
    'address',
    'documentNumber',
  ].flatMap((k) => [k, `*.${k}`, `*.*.${k}`]),
];

export function buildLoggerParams(env: Env): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length <= 128 ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      customProps: (req) => ({ correlationId: req.id }),
      autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/health/') },
      // Solo método, url, id: nada de cabeceras ni query con datos personales.
      serializers: {
        req: (req: { id: unknown; method: string; url: string; headers: unknown }) => ({
          id: req.id,
          method: req.method,
          url: req.url.split('?')[0],
          headers: req.headers,
        }),
      },
      transport:
        env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: {} } : undefined,
    },
  };
}
