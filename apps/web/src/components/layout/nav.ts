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
    { to: '/panel/comercios', label: 'Comercios', icon: Building2 },
    { to: '/panel/repartidores', label: 'Repartidores', icon: Bike },
    { to: '/panel/zonas', label: 'Zonas y tarifas', icon: Map },
  ],
  [{ to: '/panel/configuracion', label: 'Configuración', icon: Settings }],
];

export const PANEL_NAV: NavItem[] = PANEL_NAV_GROUPS.flat();

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
  {
    to: '/prototipo/ingreso',
    label: 'Ingreso y empresa',
    description: 'Inicio de sesión, error genérico y selector de empresa.',
  },
  {
    to: '/prototipo/olvide-contrasena',
    label: 'Recuperar contraseña',
    description: 'Pedir el enlace, sin revelar qué correos existen.',
  },
  {
    to: '/prototipo/restablecer-contrasena',
    hash: 'token=demo-enlace-valido',
    href: '/prototipo/restablecer-contrasena#token=demo-enlace-valido',
    label: 'Restablecer contraseña',
    description: 'Token en #token=, requisitos en vivo, enlace vencido.',
  },
] as const;
