import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';

const rootRoute = createRootRoute({ component: () => <Outlet /> });

export function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-3xl font-semibold">ZESTIA DELIVERY</h1>
      <p className="text-muted-foreground">Plataforma en construcción (R1 — Fundaciones).</p>
      <Button variant="secondary">Próximamente</Button>
    </main>
  );
}

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage });

const routeTree = rootRoute.addChildren([indexRoute]);

export function createAppRouter(opts?: {
  history?: Parameters<typeof createRouter>[0]['history'];
}) {
  return createRouter({ routeTree, ...(opts?.history ? { history: opts.history } : {}) });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
