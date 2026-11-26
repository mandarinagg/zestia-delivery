import { z } from 'zod';

const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, 'debe ser una URL postgresql://usuario:clave@host:puerto/base');

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

const intInRange = (min: number, max: number, fallback: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

/** Orígenes web permitidos (CSV de `scheme://host[:puerto]`, sin barra final). */
const originList = z
  .string()
  .transform((raw) =>
    raw
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0),
  )
  .pipe(
    z
      .array(
        z
          .string()
          .regex(/^https?:\/\/[^/\s?#]+$/, 'cada origen debe ser scheme://host[:puerto], sin ruta'),
      )
      .min(1),
  );

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /**
     * Conexión de la API: SIEMPRE con el rol de aplicación (`zestia_app`), que no es dueño de
     * las tablas ni tiene SUPERUSER/BYPASSRLS. Las migraciones usan otra URL (solo el CLI de Prisma).
     */
    DATABASE_URL: postgresUrl,
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    /**
     * `trust proxy` de Express: cuántos proxies delante de la API se consideran confiables para
     * tomar la IP del cliente de `X-Forwarded-For` (rate limit). 0 = ninguno (local).
     */
    TRUST_PROXY_HOPS: intInRange(0, 10, 0),
    /** Orígenes del frontend aceptados en requests que cambian estado (CSRF, ver SECURITY.md). */
    APP_ORIGINS: originList.default(['http://localhost:5173']),
    /** URL pública del frontend: base de los enlaces de los emails (reset, invitaciones). */
    WEB_BASE_URL: z
      .string()
      .regex(/^https?:\/\/[^\s?#]+[^/\s?#]$/, 'debe ser una URL http(s) sin barra final')
      .default('http://localhost:5173'),

    /** Sesión: vencimiento por inactividad y absoluto (ASVS 3.3: 30 min / 12 h). */
    SESSION_IDLE_TIMEOUT_MINUTES: intInRange(1, 1440, 30),
    SESSION_ABSOLUTE_TIMEOUT_HOURS: intInRange(1, 720, 12),
    /**
     * Cookie `Secure` (+ prefijo `__Host-`). Por defecto activada salvo en `development`
     * (http://localhost). En producción no se puede desactivar.
     */
    SESSION_COOKIE_SECURE: booleanString.optional(),

    /** Rate limit de login (compartido entre instancias, en Postgres). */
    LOGIN_RATE_WINDOW_MINUTES: intInRange(1, 1440, 15),
    LOGIN_RATE_MAX_PER_ACCOUNT: intInRange(1, 100, 5),
    LOGIN_RATE_MAX_PER_IP: intInRange(1, 10000, 50),

    /** Reset de contraseña. */
    PASSWORD_RESET_TTL_MINUTES: intInRange(5, 120, 30),

    /** Invitaciones a un tenant (#18): vencimiento del enlace. */
    INVITATION_TTL_HOURS: intInRange(1, 720, 168),
    PASSWORD_RESET_RATE_WINDOW_MINUTES: intInRange(1, 1440, 60),
    PASSWORD_RESET_RATE_MAX_PER_ACCOUNT: intInRange(1, 100, 3),
    PASSWORD_RESET_RATE_MAX_PER_IP: intInRange(1, 10000, 20),

    /** SMTP (en desarrollo: Mailpit de infra/docker). */
    SMTP_HOST: z.string().min(1).default('localhost'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    /** TLS implícito (puerto 465). Con `false` se usa STARTTLS si el servidor lo ofrece. */
    SMTP_SECURE: booleanString.default(false),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    MAIL_FROM: z.string().min(3).default('ZESTIA DELIVERY <no-reply@zestia-delivery.test>'),
  })
  .transform(({ SESSION_COOKIE_SECURE, ...env }) => ({
    ...env,
    SESSION_COOKIE_SECURE: SESSION_COOKIE_SECURE ?? env.NODE_ENV !== 'development',
  }))
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.SESSION_COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_COOKIE_SECURE'],
        message: 'no se puede desactivar en producción',
      });
    }
    if (env.SESSION_IDLE_TIMEOUT_MINUTES > env.SESSION_ABSOLUTE_TIMEOUT_HOURS * 60) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_IDLE_TIMEOUT_MINUTES'],
        message: 'no puede superar el vencimiento absoluto',
      });
    }
    if ((env.SMTP_USER === undefined) !== (env.SMTP_PASSWORD === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_USER'],
        message: 'SMTP_USER y SMTP_PASSWORD van juntos',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

/** Lee y valida las variables de entorno; falla rápido con un mensaje claro. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Solo la ruta y el mensaje: nunca el valor (la URL de DB lleva la clave).
    const details = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Configuración de entorno inválida: ${details}`);
  }
  return parsed.data;
}
