/**
 * Límites de módulos (ver README, "Límites de módulos" y docs/ARCHITECTURE.md).
 *
 * Reglas (default: disallow, solo se permite lo listado):
 *  - apps -> packages (contracts, domain, auth): permitido.
 *  - packages -> apps: prohibido. apps entre sí: prohibido.
 *  - packages/domain y packages/contracts no dependen de ningún otro package.
 *  - apps/api/src/modules/<a> -> apps/api/src/modules/<b>: solo vía su `index.ts` público.
 *    Importar archivos internos (servicios, repositorios, entidades) de otro módulo falla.
 *  - Dependencias externas de packages/domain: ver `domainPurity` (no-restricted-imports).
 */

export const boundariesElements = [
  // Orden importa: el primero que coincide clasifica el archivo.
  {
    type: 'api-module',
    pattern: 'apps/api/src/modules/*',
    capture: ['moduleName'],
    partialMatch: false,
  },
  { type: 'api-app', pattern: 'apps/api/src', partialMatch: false },
  { type: 'web-app', pattern: 'apps/web/src', partialMatch: false },
  { type: 'pkg-contracts', pattern: 'packages/contracts', partialMatch: false },
  { type: 'pkg-domain', pattern: 'packages/domain', partialMatch: false },
  { type: 'pkg-auth', pattern: 'packages/auth', partialMatch: false },
  { type: 'pkg-config', pattern: 'packages/config', partialMatch: false },
];

export const boundariesFiles = [
  // API pública de un módulo: lo único que otros módulos pueden importar.
  { pattern: 'apps/api/src/modules/*/index.ts', category: 'module-public' },
];

const sharedPackages = ['pkg-contracts', 'pkg-domain', 'pkg-auth'];

export const boundariesPolicies = [
  {
    from: { element: { type: 'api-app' } },
    allow: { to: { element: { types: [...sharedPackages, 'api-app', 'api-module'] } } },
  },
  {
    from: { element: { type: 'api-module' } },
    allow: {
      to: [
        { element: { types: [...sharedPackages, 'api-app'] } },
        // Otros módulos: únicamente su index.ts público.
        { element: { type: 'api-module' }, file: { categories: 'module-public' } },
      ],
    },
  },
  {
    from: { element: { type: 'web-app' } },
    allow: { to: { element: { types: [...sharedPackages, 'web-app'] } } },
  },
  {
    from: { element: { type: 'pkg-auth' } },
    allow: { to: { element: { types: ['pkg-contracts', 'pkg-domain'] } } },
  },
  // pkg-contracts y pkg-domain: sin permisos hacia otros elementos (default disallow).
];

export const boundariesRuleOptions = {
  default: 'disallow',
  policies: boundariesPolicies,
  message:
    'Import prohibido por los límites de módulos: {{ from.element.types.[0] }} -> {{ to.element.types.[0] }}. ' +
    'Regla: apps -> packages sí; packages -> apps no; un módulo de la API solo importa de otro su index.ts público.',
};

/** Dependencias externas que `packages/domain` (lógica pura) no puede usar. */
export const domainPurity = {
  patterns: [
    {
      group: ['@nestjs/*', 'express', 'fastify', 'nestjs-*'],
      message: 'domain no depende de frameworks.',
    },
    {
      group: [
        '@prisma/*',
        'prisma',
        'pg',
        'pg-*',
        'typeorm',
        'kysely',
        'drizzle-orm',
        'drizzle-orm/*',
      ],
      message: 'domain no depende de DB/ORM.',
    },
    {
      group: [
        'pino',
        'pino-*',
        'react',
        'react-dom',
        'node:fs',
        'node:fs/*',
        'node:net',
        'node:http',
        'node:https',
        'node:child_process',
        'fs',
        'net',
        'http',
        'https',
        'child_process',
      ],
      message: 'domain no hace I/O ni usa UI/logging.',
    },
  ],
};
