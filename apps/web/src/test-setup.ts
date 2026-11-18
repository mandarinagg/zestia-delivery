import '@testing-library/jest-dom/vitest';

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
