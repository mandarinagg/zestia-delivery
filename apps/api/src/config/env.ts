import { z } from 'zod';

const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\//, 'debe ser una URL postgresql://usuario:clave@host:puerto/base');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /**
   * Conexión de la API: SIEMPRE con el rol de aplicación (`zestia_app`), que no es dueño de
   * las tablas ni tiene SUPERUSER/BYPASSRLS. Las migraciones usan otra URL (solo el CLI de Prisma).
   */
  DATABASE_URL: postgresUrl,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
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
