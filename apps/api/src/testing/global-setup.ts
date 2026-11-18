import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import type { TestDatabaseUrls } from './test-database';

/**
 * Levanta un Postgres real para los tests de integración (una vez por corrida):
 *  1. misma imagen que infra/docker y el MISMO script de roles (01-roles.sh);
 *  2. aplica las migraciones con `prisma migrate deploy` como `zestia_migrator`;
 *  3. publica las URLs: la API y los tests de RLS usan `zestia_app` (sin BYPASSRLS);
 *     `admin` (superusuario de bootstrap) solo siembra datos de prueba.
 * Las claves son aleatorias por corrida.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const apiRoot = project.config.root;
  const repoRoot = path.resolve(apiRoot, '../..');
  const secret = (): string => randomBytes(16).toString('hex');
  const migratorPassword = secret();
  const appPassword = secret();

  const container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('zestia')
    .withUsername('zestia_admin')
    .withPassword(secret())
    .withEnvironment({
      ZESTIA_MIGRATOR_PASSWORD: migratorPassword,
      ZESTIA_APP_PASSWORD: appPassword,
    })
    .withCopyFilesToContainer([
      {
        source: path.join(repoRoot, 'infra/docker/postgres/initdb/01-roles.sh'),
        target: '/docker-entrypoint-initdb.d/01-roles.sh',
        mode: 0o755,
      },
    ])
    .start();

  const host = container.getHost();
  const port = container.getPort();
  const url = (user: string, password: string): string =>
    `postgresql://${user}:${password}@${host}:${port}/zestia`;

  const urls: TestDatabaseUrls = {
    admin: container.getConnectionUri(),
    migrator: url('zestia_migrator', migratorPassword),
    app: url('zestia_app', appPassword),
  };

  try {
    execFileSync(path.join(apiRoot, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
      cwd: apiRoot,
      env: { ...process.env, MIGRATION_DATABASE_URL: urls.migrator },
      stdio: 'pipe',
    });
  } catch (error) {
    await container.stop();
    const output = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `prisma migrate deploy falló:\n${String(output.stdout ?? '')}\n${String(output.stderr ?? '')}`,
      { cause: error },
    );
  }

  project.provide('testDatabase', urls);

  return async () => {
    await container.stop();
  };
}
