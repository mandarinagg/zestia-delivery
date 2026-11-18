import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Link,
  Outlet,
} from '@tanstack/react-router';
import { PanelLayout } from '@/components/layout/panel-layout';
import { buttonVariants } from '@/components/ui/button';
import {
  ComercioArea,
  RepartidorArea,
  SectionPlaceholder,
  TrackingArea,
} from '@/routes/placeholders';

const rootRoute = createRootRoute({ component: () => <Outlet /> });

export function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold">ZESTIA DELIVERY</h1>
      <p className="text-muted-foreground">Plataforma en construcción (R1 — Fundaciones).</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link to="/panel/" className={buttonVariants()}>
          Panel de operaciones
        </Link>
        <Link to="/comercio" className={buttonVariants({ variant: 'outline' })}>
          Portal del comercio
        </Link>
        <Link to="/repartidor" className={buttonVariants({ variant: 'outline' })}>
          App del repartidor
        </Link>
      </div>
    </main>
  );
}

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage });

const panelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/panel',
  component: PanelLayout,
});

const sections = [
  ['/', 'Despacho', 'Tablero de despacho en tiempo real.'],
  ['pedidos', 'Pedidos', 'Alta, seguimiento y gestión de pedidos.'],
  ['comercios', 'Comercios', 'Comercios y sus sucursales.'],
  ['repartidores', 'Repartidores', 'Flota, disponibilidad y asignaciones.'],
  ['zonas', 'Zonas y tarifas', 'Zonas de cobertura y tarifas.'],
  ['incidencias', 'Incidencias', 'Problemas en entregas y su resolución.'],
  ['efectivo', 'Efectivo', 'Cobros y rendiciones de efectivo.'],
  ['configuracion', 'Configuración', 'Datos de la empresa, usuarios y roles.'],
] as const;

const sectionRoutes = sections.map(([path, title, description]) =>
  createRoute({
    getParentRoute: () => panelRoute,
    path,
    component: () => <SectionPlaceholder title={title} description={description} />,
  }),
);

const uiRoute = createRoute({
  getParentRoute: () => panelRoute,
  path: 'ui',
  component: lazyRouteComponent(() => import('@/routes/ui-showcase'), 'UiShowcasePage'),
});

const comercioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/comercio',
  component: ComercioArea,
});
const repartidorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/repartidor',
  component: RepartidorArea,
});
const trackingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/t/$token',
  component: TrackingArea,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  panelRoute.addChildren([...sectionRoutes, uiRoute]),
  comercioRoute,
  repartidorRoute,
  trackingRoute,
]);

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
