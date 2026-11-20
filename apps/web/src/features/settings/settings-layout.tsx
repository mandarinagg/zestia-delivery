import { Link, Outlet } from '@tanstack/react-router';
import { type Permission, type Role, can } from '@zestia/auth';
import { activeMembership, useSession } from '@/lib/session';

/** Pestañas de Configuración. Cada una exige su permiso (la ruta también lo valida). */
export const SETTINGS_TABS = [
  { to: '/panel/configuracion/usuarios', label: 'Usuarios', permission: 'users:read' },
  { to: '/panel/configuracion/auditoria', label: 'Auditoría', permission: 'audit:read' },
] as const satisfies readonly { to: string; label: string; permission: Permission }[];

export function settingsTabsFor(role: Role | null) {
  return SETTINGS_TABS.filter((tab) => role !== null && can(role, tab.permission));
}

export function SettingsLayout() {
  const role = activeMembership(useSession())?.role ?? null;
  const tabs = settingsTabsFor(role);

  return (
    <>
      {tabs.length > 1 ? (
        <nav aria-label="Configuración" className="mb-6 border-b">
          <ul className="-mb-px flex gap-1">
            {tabs.map((tab) => (
              <li key={tab.to}>
                <Link
                  to={tab.to}
                  className="inline-flex h-10 items-center border-b-2 border-transparent px-3 text-sm font-semibold text-muted-foreground transition-colors duration-(--dur-fast) hover:text-foreground pointer-coarse:h-11"
                  activeProps={{
                    className: 'border-brand text-foreground',
                    'aria-current': 'page',
                  }}
                >
                  {tab.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <Outlet />
    </>
  );
}
