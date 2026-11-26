/*
 * PROTOTIPO — DATOS DE EJEMPLO de la app del repartidor.
 * Entregas inventadas de "Ramón Giménez" (c1). Nada de esto sale de la API.
 */
import type { CashStatus, OrderStatus, PaymentMethod } from '@/lib/order-states';
import { merchantById, minutesAgo } from '../demo-data';

export interface CourierOrder {
  id: string;
  status: OrderStatus;
  merchant: string;
  branch: string;
  pickupAddress: string;
  dropBarrio: string;
  city: string;
  address: string;
  reference: string;
  /** Solo nombre de pila del destinatario: dato mínimo necesario. */
  recipient: string;
  /** Número ficticio en formato E.164 sin "+". */
  phone: string;
  amount: number;
  method: PaymentMethod;
  cash: CashStatus;
  /** Importe efectivamente cobrado (si difiere del esperado). */
  collected?: number;
  window?: string;
  updatedAt: string;
  /** Cambio hecho sin señal y todavía no enviado. */
  pendingSync?: boolean;
}

function order(
  id: string,
  status: OrderStatus,
  merchantId: string,
  drop: Pick<CourierOrder, 'dropBarrio' | 'address' | 'reference' | 'recipient'> & {
    city?: string;
  },
  money: { amount: number; method: PaymentMethod; cash?: CashStatus },
  minAgo: number,
  extra: Partial<CourierOrder> = {},
): CourierOrder {
  const m = merchantById(merchantId);
  return {
    id,
    status,
    merchant: m.name,
    branch: m.branch,
    pickupAddress: `${m.barrio}, calle de ejemplo`,
    city: drop.city ?? 'Asunción',
    phone: `595981000${id.slice(-3)}`,
    cash:
      money.cash ?? (money.method === 'EFECTIVO' && money.amount > 0 ? 'PENDIENTE' : 'NO_APLICA'),
    updatedAt: minutesAgo(minAgo),
    ...drop,
    amount: money.amount,
    method: money.method,
    ...extra,
  };
}

export const COURIER_ORDERS: CourierOrder[] = [
  order(
    'DEMO-1043',
    'EN_CAMINO',
    'm1',
    {
      dropBarrio: 'Villa Morra',
      address: 'Av. Ejemplo 1234',
      reference: 'Portón negro, al lado de la despensa',
      recipient: 'María',
    },
    { amount: 85000, method: 'EFECTIVO' },
    18,
  ),
  order(
    'DEMO-1041',
    'RETIRADO',
    'm4',
    {
      dropBarrio: 'Las Lomas',
      address: 'Pasaje Muestra 455',
      reference: 'Edificio con rejas verdes, 3.er piso',
      recipient: 'Julio',
    },
    { amount: 0, method: 'PREPAGO' },
    4,
  ),
  order(
    'DEMO-1049',
    'ACEPTADO',
    'm1',
    {
      dropBarrio: 'Los Laureles',
      address: 'Calle Demo c/ Prueba',
      reference: 'Frente a la plaza, casa esquina',
      recipient: 'Ana',
    },
    { amount: 61000, method: 'EFECTIVO' },
    5,
    { window: '15:00–16:00' },
  ),
  order(
    'DEMO-1056',
    'ASIGNADO',
    'm3',
    {
      dropBarrio: 'Mburucuyá',
      address: 'Av. Ficticia 2020',
      reference: 'Tocar timbre 2, perro guardián',
      recipient: 'Carlos',
    },
    { amount: 0, method: 'QR' },
    1,
  ),
  order(
    'DEMO-1038',
    'ENTREGADO',
    'm3',
    {
      dropBarrio: 'Mburucuyá',
      address: 'Calle Uno c/ Calle Dos',
      reference: 'Atrás del colegio, casa blanca',
      recipient: 'Laura',
    },
    { amount: 100000, method: 'EFECTIVO', cash: 'COBRADO' },
    35,
  ),
  order(
    'DEMO-1031',
    'ENTREGADO',
    'm2',
    {
      dropBarrio: 'Sajonia',
      address: 'Av. Ejemplo 880',
      reference: 'Casa con rejas blancas',
      recipient: 'Pedro',
    },
    { amount: 85000, method: 'EFECTIVO', cash: 'COBRADO' },
    95,
  ),
  order(
    'DEMO-1027',
    'ENTREGADO',
    'm6',
    {
      dropBarrio: 'Centro',
      address: 'Calle Demo 77',
      reference: 'Oficina en planta baja',
      recipient: 'Rosa',
    },
    { amount: 0, method: 'TRANSFERENCIA' },
    140,
  ),
];

export const REJECT_REASONS = [
  'Estoy lejos del comercio',
  'Mi vehículo no da para este pedido',
  'Ya tengo demasiadas entregas',
  'Problema con la moto',
  'Otro motivo',
] as const;
