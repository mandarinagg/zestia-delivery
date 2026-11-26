import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { App } from '@/App';
import { createAppRouter } from '@/router';

/** Renderiza la app completa (router + React Query) en una ruta. */
export function renderApp(path: string) {
  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });
  const view = render(<App router={router} />);
  return { router, ...view };
}
