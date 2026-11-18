import { type Permission, type Role, can } from '@zestia/auth';
import {
  Banknote,
  Building2,
  Map,
  Package,
  Radio,
  Settings,
  ShieldAlert,
  Bike,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /**
   * Permiso para ver la sección. Sin permiso: cualquier rol del panel (las secciones de R2
   * todavía no tienen permisos propios). Solo esconde: la API decide.
   */
  permission?: Permission;
}

/** Navegación del panel, en grupos separados por una línea (sin rótulos: el grupo se lee solo). */
export const PANEL_NAV_GROUPS: NavItem[][] = [
  [
    { to: '/panel/', label: 'Despacho', icon: Radio },
    { to: '/panel/pedidos', label: 'Pedidos', icon: Package },
    { to: '/panel/incidencias', label: 'Incidencias', icon: ShieldAlert },
    { to: '/panel/efectivo', label: 'Efectivo', icon: Banknote },
  ],
  [
    { to: '/panel/comercios', label: 'Comercios', icon: Building2, permission: 'merchants:read' },
    { to: '/panel/repartidores', label: 'Repartidores', icon: Bike },
    { to: '/panel/zonas', label: 'Zonas y tarifas', icon: Map },
  ],
  [
    {
      to: '/panel/configuracion',
      label: 'Configuración',
      icon: Settings,
      permission: 'users:read',
    },
  ],
];

export const PANEL_NAV: NavItem[] = PANEL_NAV_GROUPS.flat();

/** Grupos de navegación que el rol puede ver (los grupos vacíos se omiten). */
export function navGroupsFor(role: Role | null): NavItem[][] {
  return PANEL_NAV_GROUPS.map((group) =>
    group.filter((item) => !item.permission || (role !== null && can(role, item.permission))),
  ).filter((group) => group.length > 0);
}

/** Prototipos navegables (datos de ejemplo, sin backend). */
export const PROTOTYPES = [
  {
    to: '/panel/prototipo/despacho',
    label: 'Despacho en vivo',
    description: 'Tablero por estado, asignación, demoras e incidencias.',
  },
  {
    to: '/panel/prototipo/pedido/$id',
    params: { id: 'DEMO-1043' },
    href: '/panel/prototipo/pedido/DEMO-1043',
    label: 'Detalle de pedido',
    description: 'Recorrido, historial, cobro e incidencias.',
  },
  {
    to: '/prototipo/repartidor',
    label: 'App del repartidor',
    description: 'Entregas del día, acciones de pulgar y cola sin señal.',
  },
  {
    to: '/prototipo/seguimiento',
    label: 'Seguimiento público',
    description: 'Lo que ve el cliente final con el link de tracking.',
  },
] as const;
