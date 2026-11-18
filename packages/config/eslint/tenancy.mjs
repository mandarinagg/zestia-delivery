/**
 * Guardas de multi-tenancy en la API (issue #15, docs/ARCHITECTURE.md "Multi-tenancy").
 *
 * Objetivo: que sea imposible que un repositorio consulte la DB fuera de la transacción de
 * tenant. El único cliente con `app.tenant_id` fijado es `TenantDb.tx` (modules/tenancy).
 *
 *  1. Solo `database/`, `health/` y `modules/tenancy/` pueden importar el cliente Prisma crudo
 *     (`database/prisma.service`) o valores del cliente generado (`generated/prisma`).
 *     Los tipos (`import type`) del cliente generado sí se permiten en todos lados.
 *  2. Solo `modules/tenancy/` puede mencionar las variables de sesión de RLS
 *     (`app.tenant_id`, `app.user_id`), `set_config` o `row_security` en SQL.
 *  Los tests y `src/testing/` quedan exentos (siembran datos y atacan la DB a propósito).
 */

const API_SRC = 'apps/api/src';

export const tenancyAllowedPrismaFiles = [
  `${API_SRC}/database/**/*.ts`,
  `${API_SRC}/health/**/*.ts`,
  `${API_SRC}/modules/tenancy/**/*.ts`,
];

export const tenancyExemptFiles = [`${API_SRC}/testing/**/*.ts`, `${API_SRC}/**/*.test.ts`];

const rawPrismaImport = {
  '@typescript-eslint/no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          regex: '(^|/)database/prisma\\.service$',
          message:
            'El cliente Prisma crudo no tiene tenant. Inyectá TenantDb (modules/tenancy) y usá db.tx.',
        },
        {
          regex: '(^|/)generated/prisma(/.*)?$',
          allowTypeImports: true,
          message:
            'Solo tipos (`import type`) del cliente generado. Enums: importalos desde modules/tenancy.',
        },
      ],
    },
  ],
};

const RLS_SQL = '/app\\.(tenant|user)_id|set_config|row_security/i';

const rlsSessionSql = {
  'no-restricted-syntax': [
    'error',
    {
      selector: `Literal[value=${RLS_SQL}]`,
      message: 'Las variables de sesión de RLS solo se manejan en modules/tenancy (TenantDb).',
    },
    {
      selector: `TemplateElement[value.raw=${RLS_SQL}]`,
      message: 'Las variables de sesión de RLS solo se manejan en modules/tenancy (TenantDb).',
    },
  ],
};

/** Bloques de flat config para la API. */
export const tenancyConfigs = [
  {
    files: [`${API_SRC}/**/*.ts`],
    ignores: [...tenancyAllowedPrismaFiles, ...tenancyExemptFiles],
    rules: rawPrismaImport,
  },
  {
    files: [`${API_SRC}/**/*.ts`],
    ignores: [`${API_SRC}/modules/tenancy/**/*.ts`, ...tenancyExemptFiles],
    rules: rlsSessionSql,
  },
];
