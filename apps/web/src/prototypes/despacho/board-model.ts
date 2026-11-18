/*
 * PROTOTIPO — modelo local del tablero de despacho. Estado de pantalla, no de negocio:
 * en producción cada acción es un comando a la API y la transición la valida OrderStateMachine.
 */
import { minutesBetween } from '@/lib/format';
import { HAPPY_PATH, type OrderStatus } from '@/lib/order-states';
import { COURIERS, DEMO_ORDERS, DEMO_SLA, type DemoOrder } from '../demo-data';

export interface BoardColumn {
  id: string;
  title: string;
  statuses: OrderStatus[];
  /** Texto corto que explica qué hace falta en la columna. */
  hint: string;
}

/** Columnas = fases operativas; dentro de cada una, primero lo que más espera (FIFO). */
export const COLUMNS: BoardColumn[] = [
  {
    id: 'entrada',
    title: 'Por asignar',
    statuses: ['RECIBIDO', 'PENDIENTE_ASIGNACION'],
    hint: 'Esperan repartidor',
  },
  {
    id: 'asignacion',
    title: 'Asignados',
    statuses: ['ASIGNADO', 'ACEPTADO'],
    hint: 'Esperan que salgan a retirar',
  },
  { id: 'retiro', title: 'En retiro', statuses: ['EN_RETIRO', 'RETIRADO'], hint: 'En el comercio' },
  { id: 'ruta', title: 'En camino', statuses: ['EN_CAMINO'], hint: 'Hacia el destinatario' },
  {
    id: 'problema',
    title: 'Con problema',
    statuses: ['NO_ENTREGADO', 'EN_DEVOLUCION'],
    hint: 'Reprogramar o devolver',
  },
];

export const CLOSED: OrderStatus[] = ['ENTREGADO', 'DEVUELTO', 'CANCELADO'];

export function minutesInState(order: DemoOrder, now: string): number {
  return minutesBetween(order.statusSince, now);
}

/** Minutos por encima del SLA del estado; 0 si no está demorado. */
export function overdue(order: DemoOrder, now: string): number {
  const sla = DEMO_SLA[order.status];
  if (sla === undefined) return 0;
  return Math.max(0, minutesInState(order, now) - sla);
}

export function isActive(order: DemoOrder): boolean {
  return !CLOSED.includes(order.status);
}

export function canAssign(order: DemoOrder): boolean {
  return order.status === 'PENDIENTE_ASIGNACION';
}

/** Repartidores que pueden recibir pedidos (estado DISPONIBLE u OCUPADO). */
export function assignableCouriers() {
  return COURIERS.filter((c) => c.availability !== 'FUERA_DE_TURNO');
}

export function activeLoad(orders: DemoOrder[], courierId: string): number {
  return orders.filter((o) => o.courierId === courierId && isActive(o)).length;
}

/** Siguiente estado del camino feliz (solo para el botón "Simular avance" del prototipo). */
export function nextHappyStatus(status: OrderStatus): OrderStatus | null {
  const i = HAPPY_PATH.indexOf(status);
  if (i < 0 || i >= HAPPY_PATH.length - 1) return null;
  return HAPPY_PATH[i + 1]!;
}

export function sortColumn(orders: DemoOrder[]): DemoOrder[] {
  return [...orders].sort((a, b) => a.statusSince.localeCompare(b.statusSince));
}

export function initialOrders(): DemoOrder[] {
  return DEMO_ORDERS.map((o) => ({ ...o }));
}

export interface BoardFilters {
  query: string;
  merchantId: string;
  courierId: string;
  onlyLate: boolean;
  onlyIncident: boolean;
}

export const EMPTY_FILTERS: BoardFilters = {
  query: '',
  merchantId: '',
  courierId: '',
  onlyLate: false,
  onlyIncident: false,
};

export function matches(order: DemoOrder, f: BoardFilters, now: string, merchantName: string) {
  if (f.merchantId && order.merchantId !== f.merchantId) return false;
  if (f.courierId && order.courierId !== f.courierId) return false;
  if (f.onlyLate && overdue(order, now) === 0) return false;
  if (f.onlyIncident && !order.hasOpenIncident) return false;
  if (f.query) {
    const q = f.query.trim().toLowerCase();
    const hay = `${order.id} ${merchantName} ${order.dropBarrio} ${order.city}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}
