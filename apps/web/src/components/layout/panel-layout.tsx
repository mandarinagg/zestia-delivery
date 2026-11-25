import { useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import {
  Check,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  FlaskConical,
  KeyRound,
  Keyboard,
  LogOut,
  Menu,
  Palette,
  Search,
} from 'lucide-react';
import { createContext, useContext, useState } from 'react';
import { authApi } from '@/features/auth/auth-api';
import { ChangePasswordDialog } from '@/features/auth/change-password-dialog';
import { useLogout } from '@/features/auth/use-logout';
import { LogoMark, Wordmark } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConnectionStatus, LiveIndicator } from '@/components/ui/connection-status';
import { Dialog, DialogDescription, DialogTitle, SheetContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { Hint } from '@/components/ui/popover';
import { toast } from '@/components/ui/toast';
import { useHotkeys } from '@/hooks/use-hotkeys';
import {
  ROLE_LABEL,
  activeMembership,
  homeFor,
  selectableMemberships,
  storeSession,
  useSession,
} from '@/lib/session';
import { useTheme, type Density } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { CommandMenu } from './command-menu';
import { type NavItem, navGroupsFor } from './nav';
import { SessionExpiryNotice } from './session-expiry-notice';
import { ShortcutsDialog } from './shortcuts-dialog';

export { PANEL_NAV } from './nav';

const COLLAPSE_KEY = 'zestia.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Acciones globales del panel, para que las páginas abran la paleta o los atajos. */
interface PanelChrome {
  openCommand: () => void;
  openShortcuts: () => void;
}
const PanelChromeContext = createContext<PanelChrome>({
  openCommand: () => undefined,
  openShortcuts: () => undefined,
});
export const usePanelChrome = () => useContext(PanelChromeContext);

const navLink =
  'group relative flex h-9 pointer-coarse:h-11 items-center gap-3 rounded-sm px-2.5 text-[0.875rem] font-medium text-sidebar-muted transition-colors duration-(--dur-fast) hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-sidebar-ring';
const navActive =
  'bg-sidebar-accent text-sidebar-foreground before:absolute before:inset-y-1.5 before:-left-2 before:w-[3px] before:rounded-r-full before:bg-sidebar-brand';

function NavEntry({
  to,
  label,
  icon: Icon,
  collapsed,
  exact,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: NavItem['icon'];
  collapsed: boolean;
  exact?: boolean;
  onNavigate?: () => void;
}) {
  const link = (
    <Link
      to={to}
      activeOptions={{ exact: exact ?? false }}
      activeProps={{ className: navActive, 'aria-current': 'page' }}
      className={cn(navLink, collapsed && 'justify-center px-0')}
      onClick={onNavigate}
    >
      <Icon aria-hidden className="size-[1.125rem] shrink-0" />
      <span className={cn('truncate', collapsed && 'sr-only')}>{label}</span>
    </Link>
  );
  return collapsed ? (
    <Hint label={label} side="right">
      {link}
    </Hint>
  ) : (
    link
  );
}

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const groups = navGroupsFor(activeMembership(useSession())?.role ?? null);
  return (
    <nav
      aria-label="Principal"
      className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3 scrollbar-thin"
    >
      {groups.map((group, gi) => (
        <div
          key={gi}
          className={cn(
            'flex flex-col gap-0.5',
            gi > 0 && 'mt-2 border-t border-sidebar-border pt-2',
          )}
        >
          {group.map((item) => (
            <NavEntry
              key={item.to}
              {...item}
              exact={item.to === '/panel/'}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
      <div className="mt-auto flex flex-col gap-0.5 border-t border-sidebar-border pt-2">
        <NavEntry
          to="/panel/ui"
          label="Guía de UI"
          icon={Palette}
          exact
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
        <NavEntry
          to="/panel/prototipo/despacho"
          label="Prototipos"
          icon={FlaskConical}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      </div>
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      to="/panel/"
      aria-label="ZESTIA Delivery, ir a Despacho"
      className={cn(
        'flex h-14 shrink-0 items-center gap-2.5 px-4 text-sidebar-foreground focus-visible:outline-sidebar-ring',
        collapsed && 'justify-center px-0',
      )}
    >
      <LogoMark />
      {collapsed ? null : <Wordmark />}
    </Link>
  );
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

/**
 * Empresa activa y cambio de empresa (`POST /auth/switch-tenant`). Al cambiar se descartan los
 * datos en caché de la empresa anterior y se va a la pantalla de inicio del nuevo rol.
 */
function TenantSwitcher() {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const active = activeMembership(session);
  if (!session || !active) return null;
  const options = selectableMemberships(session);

  async function switchTo(tenantId: string) {
    if (tenantId === active?.tenantId) return;
    try {
      const next = await authApi.switchTenant(tenantId);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
      storeSession(queryClient, next);
      const membership = activeMembership(next);
      if (!membership) return;
      toast({ tone: 'success', title: `Ahora estás en ${membership.tenantName}` });
      await navigate({ href: homeFor(membership.role) });
    } catch {
      toast({
        tone: 'danger',
        title: 'No pudimos cambiar de empresa',
        description: 'Puede que ya no tengas acceso. Recargá la página y probá de nuevo.',
      });
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Empresa activa: ${active.tenantName}. Cambiar de empresa`}
          className="flex h-10 min-w-0 max-w-64 pointer-coarse:h-11 items-center gap-2.5 rounded-md px-1.5 text-left hover:bg-accent"
        >
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-sm bg-primary font-display text-xs font-bold text-primary-foreground"
          >
            {initials(active.tenantName)}
          </span>
          <span className="hidden min-w-0 flex-col sm:flex">
            <span className="truncate text-[0.8125rem] font-semibold leading-4">
              {active.tenantName}
            </span>
            <span className="truncate text-xs leading-4 text-muted-foreground">
              {ROLE_LABEL[active.role]}
            </span>
          </span>
          <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Tus empresas</DropdownMenuLabel>
        {options.map((m) => (
          <DropdownMenuItem key={m.tenantId} onSelect={() => void switchTo(m.tenantId)}>
            <span
              aria-hidden="true"
              className="grid size-6 place-items-center rounded-xs bg-muted font-display text-[0.6875rem] font-bold"
            >
              {initials(m.tenantName)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{m.tenantName}</span>
              <span className="text-xs text-muted-foreground">{ROLE_LABEL[m.role]}</span>
            </span>
            {m.tenantId === active.tenantId ? (
              <Check aria-label="Activa" className="text-brand-ink" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ onShortcuts }: { onShortcuts: () => void }) {
  const { density, setDensity } = useTheme();
  const session = useSession();
  const role = activeMembership(session)?.role;
  const name = session?.user.name ?? '';
  const [changingPassword, setChangingPassword] = useState(false);
  const logout = useLogout();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Menú de usuario" className="rounded-full">
            <Avatar name={name} size="md" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar name={name} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-muted-foreground">{session?.user.email}</p>
              {role ? (
                <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[role]}</p>
              ) : null}
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Densidad de tablas y tablero</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={density} onValueChange={(v) => setDensity(v as Density)}>
            <DropdownMenuRadioItem value="comfortable">Cómoda</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="compact">Compacta</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onShortcuts}>
            <Keyboard aria-hidden="true" />
            <span className="flex-1">Atajos de teclado</span>
            <Kbd>?</Kbd>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setChangingPassword(true)}>
            <KeyRound aria-hidden="true" />
            Cambiar contraseña
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void logout()}>
            <LogOut aria-hidden="true" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={changingPassword} onOpenChange={setChangingPassword} />
    </>
  );
}

export function PanelLayout() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useHotkeys({
    'mod+k': () => setCommandOpen((o) => !o),
    '?': () => setShortcutsOpen(true),
  });

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      /* sin persistencia */
    }
  }

  const chrome: PanelChrome = {
    openCommand: () => setCommandOpen(true),
    openShortcuts: () => setShortcutsOpen(true),
  };

  return (
    <PanelChromeContext.Provider value={chrome}>
      <div className="flex h-dvh flex-col bg-background">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:font-semibold focus:text-primary-foreground"
        >
          Saltar al contenido
        </a>
        <div className="flex min-h-0 flex-1">
          <aside
            className={cn(
              'hidden shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-(--dur-base) ease-(--ease-standard) md:flex',
              collapsed ? 'w-16' : 'w-60',
            )}
          >
            <Brand collapsed={collapsed} />
            <NavList collapsed={collapsed} />
            <div className="border-t border-sidebar-border p-2">
              <button
                type="button"
                aria-expanded={!collapsed}
                aria-label={collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'}
                onClick={toggleCollapsed}
                className={cn(navLink, 'w-full', collapsed && 'justify-center px-0')}
              >
                {collapsed ? (
                  <ChevronsRight aria-hidden className="size-4" />
                ) : (
                  <>
                    <ChevronsLeft aria-hidden className="size-4" />
                    Contraer
                  </>
                )}
              </button>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-14 shrink-0 items-center gap-1.5 border-b bg-card px-2 sm:gap-3 sm:px-4">
              <Button
                variant="ghost"
                size="icon-lg"
                className="md:hidden"
                aria-label="Abrir menú"
                aria-haspopup="dialog"
                onClick={() => setDrawerOpen(true)}
              >
                <Menu aria-hidden className="size-5" />
              </Button>

              <TenantSwitcher />

              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                aria-label="Buscar o ir a… (Ctrl K)"
                className="ml-auto flex h-10 min-w-10 pointer-coarse:h-11 pointer-coarse:min-w-11 items-center justify-center gap-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground md:mx-auto md:h-9 md:w-full md:max-w-sm md:justify-start md:border md:border-input md:bg-subtle md:px-2.5"
              >
                <Search aria-hidden="true" className="size-4 shrink-0" />
                <span className="hidden flex-1 text-left md:inline">Buscar o ir a…</span>
                <span className="hidden items-center gap-0.5 md:flex">
                  <Kbd>Ctrl</Kbd>
                  <Kbd>K</Kbd>
                </span>
              </button>

              <div className="flex items-center gap-0.5 sm:gap-1 md:ml-0">
                <LiveIndicator className="hidden lg:inline-flex" />
                <LiveIndicator compact className="lg:hidden" />
                <Hint label="Atajos de teclado (?)">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hidden md:inline-flex"
                    aria-label="Atajos de teclado"
                    onClick={() => setShortcutsOpen(true)}
                  >
                    <Keyboard aria-hidden="true" />
                  </Button>
                </Hint>
                <ThemeToggle />
                <UserMenu onShortcuts={() => setShortcutsOpen(true)} />
              </div>
            </header>
            <ConnectionStatus />
            <main
              id="contenido"
              tabIndex={-1}
              className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 outline-none sm:px-5 md:px-6 md:py-6"
            >
              <Outlet />
            </main>
          </div>
        </div>

        <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent
            side="left"
            className="border-sidebar-border bg-sidebar text-sidebar-foreground md:hidden"
            closeClassName="top-2.5 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-sidebar-ring"
          >
            <DialogTitle className="sr-only">Menú de navegación</DialogTitle>
            <DialogDescription className="sr-only">Secciones del panel</DialogDescription>
            <Brand collapsed={false} />
            <NavList collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          </SheetContent>
        </Dialog>
        <CommandMenu
          open={commandOpen}
          onOpenChange={setCommandOpen}
          onShowShortcuts={() => setShortcutsOpen(true)}
        />
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        <SessionExpiryNotice />
      </div>
    </PanelChromeContext.Provider>
  );
}
