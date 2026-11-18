import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  // Sin prefijo VITE_: solo lo usa este archivo, nunca llega al bundle del navegador.
  const env = loadEnv(mode, process.cwd(), '');
  // La API se sirve desde el MISMO origen que la web (sin CORS; cookie SameSite=Strict y CSRF
  // por Origin). En desarrollo, Vite reenvía /api a la API. En producción lo hace el proxy
  // inverso (ver docs/DEPLOYMENT.md).
  const proxy = {
    '/api': { target: env.API_PROXY_TARGET || 'http://localhost:3000', changeOrigin: false },
  };
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test-setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
