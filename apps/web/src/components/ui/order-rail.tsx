import {
  CASH_META,
  CASH_STATUSES,
  HAPPY_PATH,
  STATUS_META,
  type CashStatus,
  type OrderStatus,
} from '@/lib/order-states';
import { cn } from '@/lib/utils';
import { TONE_CLASS } from './tone';

const STEPS = HAPPY_PATH.length;

/** Texto accesible del riel: dónde está el pedido en su recorrido. */
export function railLabel(status: OrderStatus): string {
  const meta = STATUS_META[status];
  if (meta.step !== null) return `Recorrido: ${meta.label}, paso ${meta.step + 1} de ${STEPS}`;
  if (status === 'CANCELADO') return 'Recorrido: cancelado';
  return `Recorrido: desvío a ${meta.label.toLowerCase()}`;
}

/**
 * Riel de estado — la firma visual del sistema. Ocho tramos = el camino feliz del pedido.
 * Los tramos recorridos toman el tono de la fase actual; un desvío (no entregado, devolución)
 * corta el riel y termina en su propio color; cancelado deja el riel vacío y tachado.
 * Se usa igual en la tarjeta del tablero, el detalle, la app del repartidor y el seguimiento.
 */
export function OrderRail({
  status,
  size = 'sm',
  className,
}: {
  status: OrderStatus;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const meta = STATUS_META[status];
  const tone = TONE_CLASS[meta.tone];
  const reached = meta.step ?? meta.branchFrom ?? -1;
  const cancelled = status === 'CANCELADO';
  const branch = meta.step === null && !cancelled;

  return (
    <div
      role="img"
      aria-label={railLabel(status)}
      className={cn(
        'relative flex w-full items-center',
        size === 'sm' ? 'gap-0.5' : 'gap-1',
        className,
      )}
    >
      {HAPPY_PATH.map((_, i) => {
        const done = i <= reached;
        return (
          <span
            key={i}
            className={cn(
              'flex-1 rounded-full transition-colors duration-300',
              size === 'sm' ? 'h-1' : 'h-1.5',
              done ? (branch ? 'bg-tone-slate-solid' : tone.solid) : 'bg-muted',
            )}
          />
        );
      })}
      {branch ? (
        <span
          aria-hidden="true"
          className={cn(
            'ml-0.5 shrink-0 rounded-full',
            size === 'sm' ? 'h-1 w-3' : 'h-1.5 w-5',
            tone.solid,
          )}
        />
      ) : null}
      {cancelled ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-tone-slate-solid"
        />
      ) : null}
    </div>
  );
}

const CASH_STEPS = CASH_STATUSES.filter((s) => s !== 'NO_APLICA');

/**
 * Riel del cobro: por cobrar → cobrado → rendido → liquidado, con etiquetas.
 * Separado del estado de entrega (un pedido entregado puede tener el efectivo todavía en la calle).
 */
export function CashRail({ status, className }: { status: CashStatus; className?: string }) {
  if (status === 'NO_APLICA') {
    return <p className={cn('text-sm text-muted-foreground', className)}>Sin cobro en efectivo.</p>;
  }
  const current = CASH_STEPS.indexOf(status);
  return (
    <ol className={cn('grid grid-cols-4 gap-1', className)} aria-label="Estado del cobro">
      {CASH_STEPS.map((s, i) => {
        const done = i <= current;
        const tone = TONE_CLASS[CASH_META[status].tone];
        return (
          <li key={s} aria-current={i === current ? 'step' : undefined} className="min-w-0">
            <span
              aria-hidden="true"
              className={cn('block h-1.5 rounded-full', done ? tone.solid : 'bg-muted')}
            />
            <span
              className={cn(
                'mt-1 block truncate text-xs',
                i === current ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {CASH_META[s].label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
