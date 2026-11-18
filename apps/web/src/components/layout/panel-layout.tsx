import { Link, Outlet } from '@tanstack/react-router';
import {
  Banknote,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  CircleUser,
  LayoutGrid,
  MapPinned,
  Menu,
  Package,
  Palette,
  Radio,
  Settings,
  ShieldAlert,
  Truck,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { ConnectionStatus } from '@/components/ui/connection-status';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

export const PANEL_NAV: NavItem[] = [
  { to: '/panel/', label: 'Despacho', icon: Radio },
  { to: '/panel/pedidos', label: 'Pedidos', icon: Package },
  { to: '/panel/comercios', label: 'Comercios', icon: Building2 },
  { to: '/panel/repartidores', label: 'Repartidores', icon: Truck },
  { to: '/panel/zonas', label: 'Zonas y tarifas', icon: MapPinned },
  { to: '/panel/incidencias', label: 'Incidencias', icon: ShieldAlert },
  { to: '/panel/efectivo', label: 'Efectivo', icon: Banknote },
  { to: '/panel/configuracion', label: 'Configuración', icon: Settings },
];

const COLLAPSE_KEY = 'zestia.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const link =
    'flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-sidebar-foreground hover:bg-accent hover:text-accent-foreground';
  const active = 'bg-accent text-accent-foreground';
  return (
    <nav aria-label="Principal" className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      {PANEL_NAV.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact: to === '/panel/' }}
          activeProps={{ className: active, 'aria-current': 'page' }}
          className={link}
          title={collapsed ? label : undefined}
          onClick={onNavigate}
        >
          <Icon aria-hidden className="size-4 shrink-0" />
          <span className={cn(collapsed && 'sr-only')}>{label}</span>
        </Link>
      ))}
      <div className="mt-auto pt-2">
        <Link
          to="/panel/ui"
          activeProps={{ className: active, 'aria-current': 'page' }}
          className={link}
          title={collapsed ? 'Guía de UI (desarrollo)' : undefined}
          onClick={onNavigate}
        >
          <Palette aria-hidden className="size-4 shrink-0" />
          <span className={cn(collapsed && 'sr-only')}>Guía de UI (desarrollo)</span>
        </Link>
      </div>
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
      <LayoutGrid aria-hidden className="size-5 shrink-0 text-primary" />
      <span className={cn('truncate text-sm font-bold tracking-tight', collapsed && 'sr-only')}>
        ZESTIA DELIVERY
      </span>
    </div>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
        className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-sidebar-border pr-2">
          <Brand collapsed={false} />
          <Button
            ref={closeRef}
            variant="ghost"
            size="icon"
            aria-label="Cerrar menú"
            onClick={onClose}
          >
            <X aria-hidden className="size-4" />
          </Button>
        </div>
        <NavList collapsed={false} onNavigate={onClose} />
      </div>
    </div>
  );
}

export function PanelLayout() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      /* sin persistencia */
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Saltar al contenido
      </a>
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-150 md:flex',
            collapsed ? 'w-14' : 'w-60',
          )}
        >
          <Brand collapsed={collapsed} />
          <NavList collapsed={collapsed} />
          <div className="border-t border-sidebar-border p-2">
            <Button
              variant="ghost"
              size={collapsed ? 'icon' : 'sm'}
              className={cn(!collapsed && 'w-full justify-start')}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
              onClick={toggleCollapsed}
            >
              {collapsed ? (
                <ChevronsRight aria-hidden className="size-4" />
              ) : (
                <>
                  <ChevronsLeft aria-hidden className="size-4" />
                  Contraer
                </>
              )}
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Abrir menú"
              aria-haspopup="dialog"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu aria-hidden className="size-5" />
            </Button>

            {/* Placeholder: el selector real llega con auth y membresías. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="max-w-56 justify-between">
                  <span className="truncate">Empresa de ejemplo</span>
                  <ChevronsUpDown aria-hidden className="size-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Empresa activa</DropdownMenuLabel>
                <DropdownMenuItem>Empresa de ejemplo</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>Sin otras empresas (demo)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              {/* Placeholder: el menú real llega con auth. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Menú de usuario">
                    <CircleUser aria-hidden className="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Usuario de ejemplo</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled>Mi perfil (próximamente)</DropdownMenuItem>
                  <DropdownMenuItem disabled>Cerrar sesión (próximamente)</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <ConnectionStatus />
          <main id="contenido" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
