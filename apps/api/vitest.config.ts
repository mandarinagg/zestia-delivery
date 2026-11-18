import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC emite la metadata de decoradores que NestJS necesita para la DI.
export default defineConfig({
  test: { globals: false, environment: 'node', include: ['src/**/*.test.ts'] },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
