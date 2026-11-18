/*
 * PROTOTIPO — DATOS DE EJEMPLO.
 * Todo lo de este archivo es inventado para los prototipos de UI: comercios, personas,
 * teléfonos y montos. No hay llamadas a la API ni lógica de negocio: las transiciones que
 * hacen los prototipos son estado local de la pantalla. La regla real vive en el backend
 * (OrderStateMachine). Los barrios son nombres de lugares, no datos de personas.
 */
import type {
  CashStatus,
  CourierAvailability,
  OrderStatus,
  PaymentMethod,
} from '@/lib/order-states';

/** Reloj fijo de los prototipos: 18/11/2026 14:32 en Asunción (17:32 UTC). */
export const DEMO_NOW = '2026-11-18T17:32:00Z';
export const DEMO_TENANT = 'Envíos Ejemplo S.A.';

export function minutesAgo(min: number, from = DEMO_NOW): string {
  return new Date(new Date(from).getTime() - min * 60_000).toISOString();
}

export interface DemoMerchant {
  id: string;
  name: string;
  branch: string;
  barrio: string;
}

export const MERCHANTS: DemoMerchant[] = [
  { id: 'm1', name: 'Lomitería Demo', branch: 'Sucursal Villa Morra', barrio: 'Villa Morra' },
  { id: 'm2', name: 'Farmacia Ejemplo', branch: 'Sucursal Centro', barrio: 'Centro' },
  { id: 'm3', name: 'Pizzería Muestra', branch: 'Sucursal Recoleta', barrio: 'Recoleta' },
  { id: 'm4', name: 'Florería Ficticia', branch: 'Casa central', barrio: 'Las Mercedes' },
  { id: 'm5', name: 'Ferretería Prueba', branch: 'Sucursal San Lorenzo', barrio: 'San Lorenzo' },
  { id: 'm6', name: 'Librería Demo', branch: 'Sucursal Sajonia', barrio: 'Sajonia' },
];

export const merchantById = (id: string) => MERCHANTS.find((m) => m.id === id)!;

export type Vehicle = 'MOTO' | 'AUTO' | 'BICI' | 'A_PIE';

export interface DemoCourier {
  id: string;
  name: string;
  vehicle: Vehicle;
  availability: CourierAvailability;
  /** Efectivo cobrado y no rendido (Gs.). */
  cashInHand: number;
  zone: string;
}

export const COURIERS: DemoCourier[] = [
  {
    id: 'c1',
    name: 'Ramón Giménez',
    vehicle: 'MOTO',
    availability: 'OCUPADO',
    cashInHand: 185000,
    zone: 'Asunción norte',
  },
  {
    id: 'c2',
    name: 'Lucía Benítez',
    vehicle: 'MOTO',
    availability: 'DISPONIBLE',
    cashInHand: 0,
    zone: 'Asunción centro',
  },
  {
    id: 'c3',
    name: 'Derlis Acosta',
    vehicle: 'MOTO',
    availability: 'OCUPADO',
    cashInHand: 92000,
    zone: 'San Lorenzo',
  },
  {
    id: 'c4',
    name: 'Nilda Ramírez',
    vehicle: 'BICI',
    availability: 'DISPONIBLE',
    cashInHand: 40000,
    zone: 'Asunción centro',
  },
  {
    id: 'c5',
    name: 'Osvaldo Martínez',
    vehicle: 'AUTO',
    availability: 'OCUPADO',
    cashInHand: 310000,
    zone: 'Gran Asunción',
  },
  {
    id: 'c6',
    name: 'Fátima Cáceres',
    vehicle: 'MOTO',
    availability: 'FUERA_DE_TURNO',
    cashInHand: 0,
    zone: 'Lambaré',
  },
];

export const courierById = (id: string | undefined) =>
  id ? COURIERS.find((c) => c.id === id) : undefined;

export const VEHICLE_LABEL: Record<Vehicle, string> = {
  MOTO: 'Moto',
  AUTO: 'Auto',
  BICI: 'Bici',
  A_PIE: 'A pie',
};

export interface DemoOrder {
  id: string;
  status: OrderStatus;
  merchantId: string;
  dropBarrio: string;
  city: string;
  address: string;
  reference: string;
  recipient: string;
  phone: string;
  /** Importe a cobrar al destinatario (Gs.). 0 si es prepago. */
  amount: number;
  method: PaymentMethod;
  cash: CashStatus;
  fee: number;
  feePaidBy: 'COMERCIO' | 'DESTINATARIO';
  courierId?: string;
  createdAt: string;
  statusSince: string;
  hasOpenIncident?: boolean;
  incident?: string;
  window?: string;
  origin: 'MANUAL' | 'PORTAL_COMERCIO' | 'API';
  /** Marca de llegada reciente (prototipo): dibuja el rastro lapacho. */
  isNew?: boolean;
}

type Seed = [
  id: string,
  status: OrderStatus,
  merchant: string,
  barrio: string,
  minInState: number,
  extra?: Partial<DemoOrder>,
];

const BARRIO_CITY: Record<string, string> = {
  'San Lorenzo': 'San Lorenzo',
  'Fernando de la Mora': 'Fernando de la Mora',
  Lambaré: 'Lambaré',
  Luque: 'Luque',
};

const SEEDS: Seed[] = [
  ['DEMO-1058', 'RECIBIDO', 'm3', 'Mburucuyá', 1, { origin: 'API', amount: 96000 }],
  ['DEMO-1057', 'PENDIENTE_ASIGNACION', 'm1', 'Carmelitas', 3, { amount: 85000 }],
  [
    'DEMO-1055',
    'PENDIENTE_ASIGNACION',
    'm2',
    'San Vicente',
    9,
    { amount: 0, method: 'PREPAGO', cash: 'NO_APLICA' },
  ],
  [
    'DEMO-1054',
    'PENDIENTE_ASIGNACION',
    'm6',
    'Trinidad',
    4,
    { amount: 52000, method: 'TRANSFERENCIA', cash: 'NO_APLICA' },
  ],
  [
    'DEMO-1052',
    'PENDIENTE_ASIGNACION',
    'm5',
    'Fernando de la Mora',
    12,
    { amount: 230000, window: '15:00–17:00' },
  ],
  ['DEMO-1053', 'ASIGNADO', 'm3', 'Recoleta', 2, { courierId: 'c2', amount: 74000 }],
  [
    'DEMO-1050',
    'ASIGNADO',
    'm4',
    'Villa Aurelia',
    6,
    { courierId: 'c4', amount: 140000, window: '14:00–16:00' },
  ],
  ['DEMO-1049', 'ACEPTADO', 'm1', 'Los Laureles', 5, { courierId: 'c1', amount: 61000 }],
  [
    'DEMO-1048',
    'EN_RETIRO',
    'm2',
    'Herrera',
    11,
    { courierId: 'c3', amount: 0, method: 'QR', cash: 'NO_APLICA' },
  ],
  [
    'DEMO-1046',
    'EN_RETIRO',
    'm5',
    'Luque',
    26,
    { courierId: 'c5', amount: 410000, hasOpenIncident: true, incident: 'Comercio cerrado' },
  ],
  ['DEMO-1045', 'RETIRADO', 'm6', 'Lambaré', 3, { courierId: 'c3', amount: 38000 }],
  [
    'DEMO-1043',
    'EN_CAMINO',
    'm1',
    'Villa Morra',
    18,
    {
      courierId: 'c1',
      amount: 85000,
      hasOpenIncident: true,
      incident: 'Sin contacto',
      origin: 'PORTAL_COMERCIO',
      createdAt: minutesAgo(74),
    },
  ],
  ['DEMO-1042', 'EN_CAMINO', 'm3', 'Ycuá Satí', 41, { courierId: 'c5', amount: 112000 }],
  [
    'DEMO-1041',
    'EN_CAMINO',
    'm4',
    'Las Lomas',
    9,
    { courierId: 'c1', amount: 0, method: 'PREPAGO', cash: 'NO_APLICA' },
  ],
  [
    'DEMO-1039',
    'NO_ENTREGADO',
    'm2',
    'Sajonia',
    7,
    { courierId: 'c4', amount: 45000, hasOpenIncident: true, incident: 'Destinatario ausente' },
  ],
  [
    'DEMO-1036',
    'EN_DEVOLUCION',
    'm5',
    'San Lorenzo',
    22,
    { courierId: 'c3', amount: 0, method: 'TRANSFERENCIA', cash: 'NO_APLICA' },
  ],
  [
    'DEMO-1040',
    'ENTREGADO',
    'm1',
    'Manorá',
    12,
    { courierId: 'c2', amount: 58000, cash: 'COBRADO' },
  ],
  [
    'DEMO-1038',
    'ENTREGADO',
    'm3',
    'Mburucuyá',
    35,
    { courierId: 'c1', amount: 100000, cash: 'COBRADO' },
  ],
  [
    'DEMO-1037',
    'ENTREGADO',
    'm6',
    'Villa Morra',
    52,
    { courierId: 'c5', amount: 0, method: 'QR', cash: 'NO_APLICA' },
  ],
  [
    'DEMO-1035',
    'ENTREGADO',
    'm2',
    'Centro',
    70,
    { courierId: 'c4', amount: 40000, cash: 'RENDIDO' },
  ],
  [
    'DEMO-1034',
    'DEVUELTO',
    'm4',
    'Lambaré',
    64,
    { courierId: 'c3', amount: 0, method: 'PREPAGO', cash: 'NO_APLICA' },
  ],
  [
    'DEMO-1033',
    'CANCELADO',
    'm5',
    'Luque',
    80,
    { amount: 0, method: 'TRANSFERENCIA', cash: 'NO_APLICA' },
  ],
];

const STREETS = [
  'Av. Ejemplo 1234',
  'Calle Demo c/ Prueba',
  'Pasaje Muestra 455',
  'Av. Ficticia 2020',
  'Calle Uno c/ Calle Dos',
];
const REFS = [
  'Portón negro, al lado de la despensa',
  'Edificio con rejas verdes, 3.er piso',
  'Frente a la plaza, casa esquina',
  'Tocar timbre 2, perro guardián',
  'Atrás del colegio, casa blanca',
];

function seedToOrder(
  [id, status, merchantId, barrio, minInState, extra = {}]: Seed,
  i: number,
): DemoOrder {
  const method = extra.method ?? 'EFECTIVO';
  const amount = extra.amount ?? 50000;
  const cash: CashStatus =
    extra.cash ?? (method === 'EFECTIVO' && amount > 0 ? 'PENDIENTE' : 'NO_APLICA');
  return {
    id,
    status,
    merchantId,
    dropBarrio: barrio,
    city: BARRIO_CITY[barrio] ?? 'Asunción',
    address: STREETS[i % STREETS.length]!,
    reference: REFS[i % REFS.length]!,
    recipient: `Cliente de ejemplo ${(i % 9) + 1}`,
    phone: `+595 981 000 ${String(100 + i).padStart(3, '0')}`,
    amount,
    method,
    cash,
    fee:
      barrio === 'Luque' || barrio === 'San Lorenzo' || barrio === 'Fernando de la Mora'
        ? 25000
        : 15000,
    feePaidBy: i % 3 === 0 ? 'DESTINATARIO' : 'COMERCIO',
    createdAt: minutesAgo(minInState + 8 + (i % 5) * 6),
    statusSince: minutesAgo(minInState),
    origin: extra.origin ?? (i % 4 === 0 ? 'PORTAL_COMERCIO' : 'MANUAL'),
    ...extra,
  };
}

export const DEMO_ORDERS: DemoOrder[] = SEEDS.map(seedToOrder);

/**
 * SLA de ejemplo por estado (minutos). En producción lo configura cada tenant;
 * "demorado" = tiempo en el estado actual > SLA (SPEC §10).
 */
export const DEMO_SLA: Partial<Record<OrderStatus, number>> = {
  RECIBIDO: 3,
  PENDIENTE_ASIGNACION: 8,
  ASIGNADO: 5,
  ACEPTADO: 10,
  EN_RETIRO: 20,
  RETIRADO: 8,
  EN_CAMINO: 35,
  NO_ENTREGADO: 15,
  EN_DEVOLUCION: 60,
};

/** Pedidos que el prototipo hace "llegar" con el botón de simulación. */
export const INCOMING_SEEDS: Seed[] = [
  ['DEMO-1059', 'PENDIENTE_ASIGNACION', 'm4', 'Villa Morra', 0, { amount: 120000 }],
  [
    'DEMO-1060',
    'PENDIENTE_ASIGNACION',
    'm2',
    'Recoleta',
    0,
    { amount: 0, method: 'QR', cash: 'NO_APLICA' },
  ],
  ['DEMO-1061', 'PENDIENTE_ASIGNACION', 'm3', 'Mburucuyá', 0, { amount: 67000, origin: 'API' }],
  ['DEMO-1062', 'PENDIENTE_ASIGNACION', 'm6', 'Sajonia', 0, { amount: 29000 }],
  ['DEMO-1063', 'PENDIENTE_ASIGNACION', 'm1', 'Las Mercedes', 0, { amount: 88000 }],
];

export function incomingOrder(n: number, now: string): DemoOrder {
  const seed = INCOMING_SEEDS[n % INCOMING_SEEDS.length]!;
  const base = seedToOrder(seed, n + 3);
  const suffix = n >= INCOMING_SEEDS.length ? `-${Math.floor(n / INCOMING_SEEDS.length)}` : '';
  return { ...base, id: `${base.id}${suffix}`, createdAt: now, statusSince: now, isNew: true };
}

export interface HistoryEntry {
  from: OrderStatus | null;
  to: OrderStatus;
  at: string;
  actor: string;
  note?: string;
  /** Hora del dispositivo si el cambio se hizo sin conexión y se sincronizó después. */
  clientAt?: string;
}

/** Historial auditado de ejemplo para el detalle de DEMO-1043 (OrderStatusHistory). */
export const HISTORY_1043: HistoryEntry[] = [
  { from: null, to: 'RECIBIDO', at: minutesAgo(74), actor: 'Portal del comercio (Lomitería Demo)' },
  {
    from: 'RECIBIDO',
    to: 'PENDIENTE_ASIGNACION',
    at: minutesAgo(74),
    actor: 'Sistema',
    note: 'Zona resuelta: Asunción norte',
  },
  {
    from: 'PENDIENTE_ASIGNACION',
    to: 'ASIGNADO',
    at: minutesAgo(70),
    actor: 'Usuario de ejemplo (despacho)',
    note: 'Asignado a Derlis Acosta',
  },
  { from: 'ASIGNADO', to: 'ACEPTADO', at: minutesAgo(69), actor: 'Derlis Acosta' },
  {
    from: 'ACEPTADO',
    to: 'PENDIENTE_ASIGNACION',
    at: minutesAgo(58),
    actor: 'Usuario de ejemplo (despacho)',
    note: 'Reasignación: pinchadura de la moto',
  },
  {
    from: 'PENDIENTE_ASIGNACION',
    to: 'ASIGNADO',
    at: minutesAgo(56),
    actor: 'Usuario de ejemplo (despacho)',
    note: 'Asignado a Ramón Giménez',
  },
  {
    from: 'ASIGNADO',
    to: 'ACEPTADO',
    at: minutesAgo(55),
    actor: 'Sistema',
    note: 'Auto-aceptación del tenant',
  },
  { from: 'ACEPTADO', to: 'EN_RETIRO', at: minutesAgo(48), actor: 'Ramón Giménez' },
  {
    from: 'EN_RETIRO',
    to: 'RETIRADO',
    at: minutesAgo(29),
    actor: 'Ramón Giménez',
    clientAt: minutesAgo(33),
  },
  { from: 'RETIRADO', to: 'EN_CAMINO', at: minutesAgo(18), actor: 'Ramón Giménez' },
];

export interface DemoIncident {
  id: string;
  category: string;
  description: string;
  openedBy: string;
  openedAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolution?: string;
}

export const INCIDENTS_1043: DemoIncident[] = [
  {
    id: 'INC-208',
    category: 'Sin contacto',
    description: 'El destinatario no atiende. Llamé dos veces y mandé WhatsApp.',
    openedBy: 'Ramón Giménez',
    openedAt: minutesAgo(6),
  },
  {
    id: 'INC-201',
    category: 'Otra',
    description: 'Demora en el retiro: el pedido no estaba listo.',
    openedBy: 'Ramón Giménez',
    openedAt: minutesAgo(40),
    resolvedBy: 'Usuario de ejemplo (despacho)',
    resolvedAt: minutesAgo(31),
    resolution: 'El comercio lo entregó 10 min después.',
  },
];

export const INCIDENT_CATEGORIES = [
  'Destinatario ausente',
  'Dirección incorrecta',
  'Comercio cerrado',
  'Rechazo',
  'Sin contacto',
  'Reprogramación',
  'Devolución',
  'Paquete dañado',
  'Otra',
] as const;
