import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
} from '@tanstack/react-router';
import { PanelLayout } from '@/components/layout/panel-layout';
import { HomePage } from '@/routes/home';
import {
  ComercioArea,
  RepartidorArea,
  SectionPlaceholder,
  TrackingArea,
} from '@/routes/placeholders';

export { HomePage } from '@/routes/home';

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage });

const panelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/panel',
  component: PanelLayout,
});

const sections = [
  ['/', 'Despacho', 'Tablero de despacho en tiempo real.', '/panel/prototipo/despacho'],
  [
    'pedidos',
    'Pedidos',
    'Alta, seguimiento y gestión de pedidos.',
    '/panel/prototipo/pedido/DEMO-1043',
  ],
  ['comercios', 'Comercios', 'Comercios y sus sucursales.', null],
  ['repartidores', 'Repartidores', 'Flota, disponibilidad y asignaciones.', null],
  ['zonas', 'Zonas y tarifas', 'Zonas de cobertura y tarifas.', null],
  ['incidencias', 'Incidencias', 'Problemas en entregas y su resolución.', null],
  ['efectivo', 'Efectivo', 'Cobros y rendiciones de efectivo.', null],
  ['configuracion', 'Configuración', 'Datos de la empresa, usuarios y roles.', null],
] as const;

const sectionRoutes = sections.map(([path, title, description, prototype]) =>
  createRoute({
    getParentRoute: () => panelRoute,
    path,
    component: () => (
      <SectionPlaceholder title={title} description={description} prototype={prototype} />
    ),
  }),
);

const uiRoute = createRoute({
  getParentRoute: () => panelRoute,
  path: 'ui',
  component: lazyRouteComponent(() => import('@/routes/ui-showcase'), 'UiShowcasePage'),
});

/* Prototipos: pantallas con datos de ejemplo, sin backend (ver docs/UI.md). */
const dispatchPrototypeRoute = createRoute({
  getParentRoute: () => panelRoute,
  path: 'prototipo/despacho',
  component: lazyRouteComponent(
    () => import('@/prototypes/despacho/dispatch-board'),
    'DispatchPrototype',
  ),
});
const orderPrototypeRoute = createRoute({
  getParentRoute: () => panelRoute,
  path: 'prototipo/pedido/$id',
  component: lazyRouteComponent(
    () => import('@/prototypes/pedido/order-detail'),
    'OrderDetailPrototype',
  ),
});
const courierPrototypeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/prototipo/repartidor',
  component: lazyRouteComponent(
    () => import('@/prototypes/repartidor/courier-app'),
    'CourierPrototype',
  ),
});
const trackingPrototypeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/prototipo/seguimiento',
  component: lazyRouteComponent(
    () => import('@/prototypes/seguimiento/tracking'),
    'TrackingPrototype',
  ),
});
const loginPrototypeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/prototipo/ingreso',
  component: lazyRouteComponent(() => import('@/prototypes/ingreso/login'), 'LoginPrototype'),
});
const forgotPrototypeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/prototipo/olvide-contrasena',
  component: lazyRouteComponent(
    () => import('@/prototypes/ingreso/forgot-password'),
    'ForgotPasswordPrototype',
  ),
});
const resetPrototypeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/prototipo/restablecer-contrasena',
  component: lazyRouteComponent(
    () => import('@/prototypes/ingreso/reset-password'),
    'ResetPasswordPrototype',
  ),
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
  panelRoute.addChildren([...sectionRoutes, uiRoute, dispatchPrototypeRoute, orderPrototypeRoute]),
  comercioRoute,
  repartidorRoute,
  trackingRoute,
  courierPrototypeRoute,
  trackingPrototypeRoute,
  loginPrototypeRoute,
  forgotPrototypeRoute,
  resetPrototypeRoute,
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
