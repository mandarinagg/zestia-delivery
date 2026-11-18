/**
 * Datos de DESARROLLO local (`pnpm db:seed`). Nunca en producción.
 *
 * Crea (o actualiza, es idempotente) dos tenants, usuarios con membresías — uno de ellos en
 * ambos tenants — y un comercio por tenant. Todos los usuarios usan la misma contraseña de
 * desarrollo, tomada de `SEED_USER_PASSWORD` (apps/api/.env; el valor de .env.example es un
 * placeholder, no un secreto).
 *
 * Se conecta con `SEED_DATABASE_URL`: el superusuario del contenedor local, porque las tablas
 * tienen RLS forzada y ni la API (`zestia_app`) ni el migrador pueden dar de alta tenants o
 * usuarios. El alta real de tenants/usuarios (onboarding) es otro issue.
 *
 * Se ejecuta con el type stripping de Node (`node src/seed/dev-seed.mts`): solo depende de
 * `pg` y `node:crypto`, sin importar código de la app.
 */
import { argon2, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

/** Mismos parámetros y formato PHC que `modules/auth/password-hashing.ts` (lo verifica un test). */
export const SEED_ARGON2 = { memory: 19_456, passes: 2, parallelism: 1 } as const;

export function hashDevPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    argon2(
      'argon2id',
      {
        message: Buffer.from(password.normalize('NFKC'), 'utf8'),
        nonce: salt,
        parallelism: SEED_ARGON2.parallelism,
        tagLength: 32,
        memory: SEED_ARGON2.memory,
        passes: SEED_ARGON2.passes,
      },
      (error, hash) => {
        if (error) return reject(error);
        const b64 = (b: Buffer) => b.toString('base64').replace(/=+$/, '');
        const { memory, passes, parallelism } = SEED_ARGON2;
        resolve(
          `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${b64(salt)}$${b64(hash)}`,
        );
      },
    );
  });
}

type Role = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'SUPERVISOR' | 'COURIER' | 'MERCHANT';

/** Ids fijos (UUID v7 válidos) para que volver a sembrar actualice en lugar de duplicar. */
export const SEED = {
  tenants: [
    {
      id: '0193a000-0000-7000-8000-000000000001',
      name: 'Delivery Demo Asunción',
      slug: 'demo-asuncion',
    },
    {
      id: '0193a000-0000-7000-8000-000000000002',
      name: 'Delivery Demo Encarnación',
      slug: 'demo-encarnacion',
    },
  ],
  users: [
    {
      id: '0193a000-0000-7000-8000-000000000101',
      email: 'ana@zestia.test',
      name: 'Ana (dueña de ambas)',
      status: 'ACTIVE',
    },
    {
      id: '0193a000-0000-7000-8000-000000000102',
      email: 'beto@zestia.test',
      name: 'Beto (operador Asunción)',
      status: 'ACTIVE',
    },
    {
      id: '0193a000-0000-7000-8000-000000000103',
      email: 'carla@zestia.test',
      name: 'Carla (dueña Encarnación)',
      status: 'ACTIVE',
    },
    {
      id: '0193a000-0000-7000-8000-000000000104',
      email: 'dario@zestia.test',
      name: 'Darío (repartidor Asunción)',
      status: 'ACTIVE',
    },
    {
      id: '0193a000-0000-7000-8000-000000000105',
      email: 'eva@zestia.test',
      name: 'Eva (deshabilitada)',
      status: 'DISABLED',
    },
  ],
  memberships: [
    { id: '0193a000-0000-7000-8000-000000000201', tenant: 0, user: 0, role: 'OWNER' },
    { id: '0193a000-0000-7000-8000-000000000202', tenant: 1, user: 0, role: 'ADMIN' },
    { id: '0193a000-0000-7000-8000-000000000203', tenant: 0, user: 1, role: 'OPERATOR' },
    { id: '0193a000-0000-7000-8000-000000000204', tenant: 1, user: 2, role: 'OWNER' },
    { id: '0193a000-0000-7000-8000-000000000205', tenant: 0, user: 3, role: 'COURIER' },
    { id: '0193a000-0000-7000-8000-000000000206', tenant: 0, user: 4, role: 'OPERATOR' },
  ] satisfies { id: string; tenant: number; user: number; role: Role }[],
  merchants: [
    { id: '0193a000-0000-7000-8000-000000000301', tenant: 0, name: 'Farmacia Central (demo)' },
    { id: '0193a000-0000-7000-8000-000000000302', tenant: 1, name: 'Panadería del Sur (demo)' },
  ],
  // Datos de ejemplo (direcciones ficticias), solo para desarrollo.
  branches: [
    {
      id: '0193a000-0000-7000-8000-000000000401',
      merchant: 0,
      name: 'Casa central (demo)',
      address: 'Calle de Ejemplo 100',
      neighborhood: 'Centro',
      city: 'Asunción',
      openingHours: {
        mon: [{ from: '08:00', to: '20:00' }],
        tue: [{ from: '08:00', to: '20:00' }],
        wed: [{ from: '08:00', to: '20:00' }],
        thu: [{ from: '08:00', to: '20:00' }],
        fri: [{ from: '08:00', to: '20:00' }],
        sat: [{ from: '08:00', to: '13:00' }],
      },
    },
  ],
} as const;

export async function seed(databaseUrl: string, password: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    for (const t of SEED.tenants) {
      await client.query(
        `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug,
           status = 'ACTIVE', updated_at = now()`,
        [t.id, t.name, t.slug],
      );
    }
    for (const u of SEED.users) {
      await client.query(
        `INSERT INTO users (id, email, name, status) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name,
           status = EXCLUDED.status, updated_at = now()`,
        [u.id, u.email, u.name, u.status],
      );
      await client.query(
        `INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash,
           password_changed_at = now(), updated_at = now()`,
        [u.id, await hashDevPassword(password)],
      );
    }
    for (const m of SEED.memberships) {
      await client.query(
        `INSERT INTO memberships (id, tenant_id, user_id, role) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, updated_at = now()`,
        [m.id, SEED.tenants[m.tenant]!.id, SEED.users[m.user]!.id, m.role],
      );
    }
    for (const m of SEED.merchants) {
      await client.query(
        `INSERT INTO merchants (id, tenant_id, name) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE',
           deleted_at = NULL, updated_at = now()`,
        [m.id, SEED.tenants[m.tenant]!.id, m.name],
      );
    }
    for (const b of SEED.branches) {
      const merchant = SEED.merchants[b.merchant]!;
      await client.query(
        `INSERT INTO merchant_branches
           (id, tenant_id, merchant_id, name, address, neighborhood, city, opening_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address,
           neighborhood = EXCLUDED.neighborhood, city = EXCLUDED.city,
           opening_hours = EXCLUDED.opening_hours, deleted_at = NULL, updated_at = now()`,
        [
          b.id,
          SEED.tenants[merchant.tenant]!.id,
          merchant.id,
          b.name,
          b.address,
          b.neighborhood,
          b.city,
          JSON.stringify(b.openingHours),
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const env = process.env;
  if (env.NODE_ENV === 'production') {
    throw new Error('db:seed es solo para desarrollo local (NODE_ENV=production).');
  }
  const url = env.SEED_DATABASE_URL;
  const password = env.SEED_USER_PASSWORD;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) {
    throw new Error('Falta SEED_DATABASE_URL (ver apps/api/.env.example).');
  }
  if (!password || password.length < 12) {
    throw new Error('Falta SEED_USER_PASSWORD (mínimo 12 caracteres; ver apps/api/.env.example).');
  }
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error('db:seed solo se conecta a una base local (localhost).');
  }
  await seed(url, password);
  console.log(
    `Seed listo: ${SEED.tenants.length} tenants, ${SEED.users.length} usuarios ` +
      `(${SEED.users.map((u) => u.email).join(', ')}), contraseña = SEED_USER_PASSWORD.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
