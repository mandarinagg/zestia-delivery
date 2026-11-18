import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// `findBy…`/`waitFor` esperan 3 s (no 1 s): con la máquina cargada (CI, turbo en paralelo) el
// primer render de la app completa puede pasar el segundo sin que haya un error real.
configure({ asyncUtilTimeout: 3000 });

window.scrollTo = () => undefined;

// jsdom no implementa estas APIs; Radix (posicionamiento) y cmdk (scroll al ítem activo) las usan.
Element.prototype.scrollIntoView ??= () => undefined;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// API falsa en memoria (src/test/fake-api.ts): cada test arranca con una sesión de Propietario.
// Los tests de ingreso la cambian con `fakeApi.reset({ as: null })`.
import { fakeApi } from './test/fake-api';
import { setCsrfToken } from './lib/api';

beforeEach(() => {
  fakeApi.reset();
  setCsrfToken(null);
  vi.stubGlobal('fetch', fakeApi.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});
