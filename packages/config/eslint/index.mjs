import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import {
  boundariesElements,
  boundariesFiles,
  boundariesRuleOptions,
  domainPurity,
} from './boundaries.mjs';

/**
 * Configuración ESLint (flat config) compartida.
 * @param {{ rootDir: string }} options rootDir: raíz del monorepo (para resolver los límites de módulos).
 */
export function createConfig({ rootDir }) {
  return tseslint.config(
    {
      ignores: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/coverage/**',
        '**/.turbo/**',
        'docs/**',
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      languageOptions: { globals: { ...globals.node } },
      rules: {
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      },
    },
    {
      // NestJS usa decoradores + metadata: los imports de tipos de constructores no pueden ser `import type`.
      files: ['apps/api/**/*.ts'],
      rules: { '@typescript-eslint/consistent-type-imports': 'off' },
    },
    {
      files: ['apps/web/**/*.{ts,tsx}'],
      languageOptions: { globals: { ...globals.browser } },
      plugins: { 'react-hooks': reactHooks },
      rules: reactHooks.configs.recommended.rules,
    },
    {
      files: ['packages/domain/src/**/*.ts'],
      rules: { 'no-restricted-imports': ['error', domainPurity] },
    },
    {
      // Límites de módulos entre apps/packages y entre módulos de la API.
      files: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
      plugins: { boundaries },
      settings: {
        'boundaries/root-path': rootDir,
        'boundaries/elements': boundariesElements,
        'boundaries/files': boundariesFiles,
        // Resuelve @zestia/* a su código fuente (tsconfig.eslint.json), sin requerir build previo.
        'import/resolver': {
          typescript: { project: `${rootDir}/tsconfig.eslint.json` },
        },
      },
      rules: {
        'boundaries/dependencies': ['error', boundariesRuleOptions],
      },
    },
  );
}
