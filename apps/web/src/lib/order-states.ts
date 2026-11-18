/**
 * Presentación de los estados reales del pedido y del cobro
 * (docs/ORDER_STATE_MACHINE.md). Solo etiquetas, tonos y posición en el riel:
 * las transiciones válidas las decide el backend (`OrderStateMachine`).
 */

export type Tone = 'slate' | 'blue' | 'teal' | 'violet' | 'green' | 'red' | 'amber' | 'earth';

export const ORDER_STATUSES = [
  'RECIBIDO',
  'PENDIENTE_ASIGNACION',
  'ASIGNADO',
  'ACEPTADO',
  'EN_RETIRO',
  'RETIRADO',
  'EN_CAMINO',
  'ENTREGADO',
  'NO_ENTREGADO',
  'EN_DEVOLUCION',
  'DEVUELTO',
  'CANCELADO',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Fase operativa: agrupa estados en el tablero y define el tono. */
export type Phase =
  'entrada' | 'asignacion' | 'retiro' | 'ruta' | 'cierre' | 'problema' | 'devolucion';

export interface StatusMeta {
  label: string;
  /** Etiqueta corta para tarjetas y celdas densas. */
  short: string;
  tone: Tone;
  phase: Phase;
  /** Posición en el camino feliz (0–7) o null si es un desvío. */
  step: number | null;
  /** Estado terminal: el pedido ya no se mueve. */
  final?: boolean;
  /** Desde qué paso del camino feliz se produce el desvío (para dibujar el riel). */
  branchFrom?: number;
}

export const STATUS_META: Record<OrderStatus, StatusMeta> = {
  RECIBIDO: { label: 'Recibido', short: 'Recibido', tone: 'slate', phase: 'entrada', step: 0 },
  PENDIENTE_ASIGNACION: {
    label: 'Pendiente de asignación',
    short: 'Por asignar',
    tone: 'slate',
    phase: 'entrada',
    step: 1,
  },
  ASIGNADO: { label: 'Asignado', short: 'Asignado', tone: 'blue', phase: 'asignacion', step: 2 },
  ACEPTADO: { label: 'Aceptado', short: 'Aceptado', tone: 'blue', phase: 'asignacion', step: 3 },
  EN_RETIRO: { label: 'En retiro', short: 'En retiro', tone: 'teal', phase: 'retiro', step: 4 },
  RETIRADO: { label: 'Retirado', short: 'Retirado', tone: 'teal', phase: 'retiro', step: 5 },
  EN_CAMINO: { label: 'En camino', short: 'En camino', tone: 'violet', phase: 'ruta', step: 6 },
  ENTREGADO: {
    label: 'Entregado',
    short: 'Entregado',
    tone: 'green',
    phase: 'cierre',
    step: 7,
    final: true,
  },
  NO_ENTREGADO: {
    label: 'No entregado',
    short: 'No entregado',
    tone: 'red',
    phase: 'problema',
    step: null,
    branchFrom: 6,
  },
  EN_DEVOLUCION: {
    label: 'En devolución',
    short: 'Devolviendo',
    tone: 'earth',
    phase: 'devolucion',
    step: null,
    branchFrom: 5,
  },
  DEVUELTO: {
    label: 'Devuelto',
    short: 'Devuelto',
    tone: 'earth',
    phase: 'devolucion',
    step: null,
    branchFrom: 5,
    final: true,
  },
  CANCELADO: {
    label: 'Cancelado',
    short: 'Cancelado',
    tone: 'slate',
    phase: 'cierre',
    step: null,
    final: true,
  },
};

/** Etiquetas del camino feliz, en orden, para el riel con leyenda. */
export const HAPPY_PATH: OrderStatus[] = [
  'RECIBIDO',
  'PENDIENTE_ASIGNACION',
  'ASIGNADO',
  'ACEPTADO',
  'EN_RETIRO',
  'RETIRADO',
  'EN_CAMINO',
  'ENTREGADO',
];

export const CASH_STATUSES = ['NO_APLICA', 'PENDIENTE', 'COBRADO', 'RENDIDO', 'LIQUIDADO'] as const;
export type CashStatus = (typeof CASH_STATUSES)[number];

export const CASH_META: Record<CashStatus, { label: string; hint: string; tone: Tone }> = {
  NO_APLICA: { label: 'Sin cobro', hint: 'No hay importe a cobrar', tone: 'slate' },
  PENDIENTE: { label: 'Por cobrar', hint: 'El repartidor todavía no cobró', tone: 'amber' },
  COBRADO: { label: 'Cobrado', hint: 'El efectivo está en manos del repartidor', tone: 'blue' },
  RENDIDO: { label: 'Rendido', hint: 'El repartidor lo entregó a la empresa', tone: 'green' },
  LIQUIDADO: { label: 'Liquidado', hint: 'Pagado al comercio', tone: 'teal' },
};

export const PAYMENT_METHOD_LABEL = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  QR: 'QR',
  PREPAGO: 'Prepago',
} as const;
export type PaymentMethod = keyof typeof PAYMENT_METHOD_LABEL;

export const COURIER_AVAILABILITY = {
  DISPONIBLE: { label: 'Disponible', tone: 'green' },
  OCUPADO: { label: 'Ocupado', tone: 'blue' },
  FUERA_DE_TURNO: { label: 'Fuera de turno', tone: 'slate' },
} as const satisfies Record<string, { label: string; tone: Tone }>;
export type CourierAvailability = keyof typeof COURIER_AVAILABILITY;
