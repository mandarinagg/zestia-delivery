import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { type Permission, can } from '@zestia/auth';
import { z } from 'zod';
import { PanelLayout } from '@/components/layout/panel-layout';
import { safeRedirect } from '@/features/auth/auth-api';
import { SettingsLayout, settingsTabsFor } from '@/features/settings/settings-layout';
import { ApiError } from '@/lib/api';
import {
  type Session,
  activeMembership,
  homeFor,
  sessionQuery,
  storeSession,
  usesPanel,
} from '@/lib/session';
import { HomePage } from '@/routes/home';
import {
  ComercioArea,
  RepartidorArea,
  SectionPlaceholder,
  TrackingArea,
} from '@/routes/placeholders';

export { HomePage } from '@/routes/home';

export interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: () => <Outlet /> });

/* --- Sesión ----------------------------------------------------------------------------- */

const redirectSearch = z.object({ redirect: z.string().optional().catch(undefined) });

/** El ingreso además puede explicar por qué se cerró la sesión (aviso de vencimiento, #14). */
const loginSearch = redirectSearch.extend({
  reason: z.enum(['idle', 'absolute']).optional().catch(undefined),
});

/**
 * Exige sesión con empresa activa (la decide el servidor; esto solo evita mostrar pantallas
 * que la API igual rechazaría). Sin sesión → ingreso; sin empresa → selector.
 */
async function requireTenant(
  queryClient: QueryClient,
  href: string,
  area: 'panel' | 'courier' | 'merchant',
): Promise<Session> {
  const session = await queryClient.ensureQueryData(sessionQuery);
  if (!session) throw redirect({ to: '/ingreso', search: { redirect: href } });
  const membership = activeMembership(session);
  if (!membership) throw redirect({ to: '/ingreso/empresa', search: { redirect: href } });
  const home = homeFor(membership.role);
  const allowed =
    area === 'panel'
      ? usesPanel(membership.role)
      : home === (area === 'courier' ? '/repartidor' : '/comercio');
  if (!allowed) throw redirect({ href: home });
  return session;
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ingreso',
  validateSearch: loginSearch,
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    const membership = activeMembership(session);
    if (membership)
      throw redirect({ href: safeRedirect(search.redirect) ?? homeFor(membership.role) });
  },
  component: lazyRouteComponent(() => import('@/features/auth/login-route'), 'LoginRoute'),
});

const companyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ingreso/empresa',
  validateSearch: redirectSearch,
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (!session) throw redirect({ to: '/ingreso', search });
    return { session };
  },
  component: lazyRouteComponent(() => import('@/features/auth/login-route'), 'CompanyRoute'),
});

const forgotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/olvide-contrasena',
  component: lazyRouteComponent(
    () => import('@/features/auth/forgot-password-page'),
    'ForgotPasswordPage',
  ),
});

/** Ruta fija: el enlace del email la arma el backend (`RESET_PASSWORD_PATH`). */
const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/restablecer-contrasena',
  component: lazyRouteComponent(
    () => import('@/features/auth/reset-password-page'),
    'ResetPasswordPage',
  ),
});

/** Ruta fija: el enlace del email la arma el backend (`ACCEPT_INVITATION_PATH`, #18). */
const invitationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invitacion',
  component: lazyRouteComponent(
    () => import('@/features/members/accept-invitation-page'),
    'AcceptInvitationPage',
  ),
});

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage });

const panelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/panel',
  beforeLoad: async ({ context, location }) => ({
    session: await requireTenant(context.queryClient, location.href, 'panel'),
  }),
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
  ['repartidores', 'Repartidores', 'Flota, disponibilidad y asignaciones.', null],
  ['zonas', 'Zonas y tarifas', 'Zonas de cobertura y tarifas.', null],
  ['incidencias', 'Incidencias', 'Problemas en entregas y su resolución.', null],
  ['efectivo', 'Efectivo', 'Cobros y rendiciones de efectivo.', null],
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

const merchantsRoute = createRoute({
  getParentRoute: () => panelRoute,
  path: 'comercios',
  component: lazyRouteComponent(
    () => import('@/features/merchants/merchants-page'),
    'MerchantsPage',
  ),
});

const merchantDetailRoute = createRoute({
  getParentRoute: () => panelRoute,
  path: 'comercios/$merchantId',
  component: lazyRouteComponent(
    () => import('@/features/merchants/merchant-detail-page'),
    'MerchantDetailPage',
  ),
});

/**
 * Configuración: Usuarios (#18) y Auditoría (#17), cada pestaña con su permiso. Sin ninguno →
 * inicio del panel; `/panel/configuracion` sola → la primera pestaña permitida.
 */
const settingsRoute = createRoute({
  getParentRoute: () => panelRoute,
  path: 'configuracion',
  beforeLoad: ({ context, location }) => {
    const tabs = settingsTabsFor(activeMembership(context.session)?.role ?? null);
    if (tabs.length === 0) throw redirect({ to: '/panel/' });
    if (location.pathname.replace(/\/$/, '') === '/panel/configuracion') {
      throw redirect({ to: tabs[0]!.to });
    }
  },
  component: SettingsLayout,
});

/** Una pestaña sin su permiso vuelve a Configuración (que elige otra). La API lo exige igual. */
function requireSettingsPermission(permission: Permission) {
  return ({ context }: { context: { session: Session } }) => {
    const membership = activeMembership(context.session);
    if (!membership || !can(membership.role, permission)) {
      throw redirect({ to: '/panel/configuracion' });
    }
  };
}

const membersRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'usuarios',
  beforeLoad: requireSettingsPermission('users:read'),
  component: lazyRouteComponent(() => import('@/features/members/members-page'), 'MembersPage'),
});

const auditRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'auditoria',
  beforeLoad: requireSettingsPermission('audit:read'),
  component: lazyRouteComponent(() => import('@/features/audit/audit-page'), 'AuditPage'),
});

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
const comercioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/comercio',
  beforeLoad: ({ context, location }) =>
    requireTenant(context.queryClient, location.href, 'merchant'),
  component: ComercioArea,
});
const repartidorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/repartidor',
  beforeLoad: ({ context, location }) =>
    requireTenant(context.queryClient, location.href, 'courier'),
  component: RepartidorArea,
});
const trackingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/t/$token',
  component: TrackingArea,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  panelRoute.addChildren([
    ...sectionRoutes,
    merchantsRoute,
    merchantDetailRoute,
    settingsRoute.addChildren([membersRoute, auditRoute]),
    uiRoute,
    dispatchPrototypeRoute,
    orderPrototypeRoute,
  ]),
  comercioRoute,
  repartidorRoute,
  trackingRoute,
  courierPrototypeRoute,
  trackingPrototypeRoute,
  loginRoute,
  companyRoute,
  forgotRoute,
  resetRoute,
  invitationRoute,
]);

/** No reintenta errores del cliente (4xx): solo fallas de red o del servidor, una vez. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < 1;
}

export function createAppRouter(opts?: {
  history?: Parameters<typeof createRouter>[0]['history'];
  queryClient?: QueryClient;
}) {
  // La sesión puede vencer en cualquier momento (inactividad, logout en otra pestaña, reset):
  // un 401 de cualquier llamada limpia la sesión y vuelve al ingreso, recordando dónde estaba.
  const onUnauthorized = (error: unknown) => {
    if (!(error instanceof ApiError) || error.status !== 401) return;
    storeSession(queryClient, null);
    const here = router.state.location.href;
    if (!here.startsWith('/ingreso')) {
      void router.navigate({ to: '/ingreso', search: { redirect: here } });
    }
  };
  const queryClient =
    opts?.queryClient ??
    new QueryClient({
      queryCache: new QueryCache({ onError: onUnauthorized }),
      mutationCache: new MutationCache({ onError: onUnauthorized }),
      defaultOptions: { queries: { retry: shouldRetry }, mutations: { retry: false } },
    });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    ...(opts?.history ? { history: opts.history } : {}),
  });
  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
