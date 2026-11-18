import '@testing-library/jest-dom/vitest';

window.scrollTo = () => undefined;

// jsdom no implementa estas APIs; Radix (posicionamiento) y cmdk (scroll al ítem activo) las usan.
Element.prototype.scrollIntoView ??= () => undefined;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
