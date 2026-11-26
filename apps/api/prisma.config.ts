import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// El CLI de Prisma no carga .env por sí mismo.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.MIGRATION_DATABASE_URL ?? '' },
});
