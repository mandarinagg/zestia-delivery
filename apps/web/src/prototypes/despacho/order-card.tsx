import { Clock3, Flag, UserPlus } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { OrderRail } from '@/components/ui/order-rail';
import { OrderStatusPill } from '@/components/ui/status-pill';
import { formatMinutes, formatPYG } from '@/lib/format';
import { vtName } from '@/lib/motion';
import { PAYMENT_METHOD_LABEL } from '@/lib/order-states';
import { cn } from '@/lib/utils';
import { courierById, merchantById, type DemoOrder } from '../demo-data';
import { minutesInState, overdue } from './board-model';

export function shortName(name: string) {
  const [first, last] = name.split(' ');
  return last ? `${first} ${last[0]}.` : name;
}

export function orderSummary(order: DemoOrder, now: string): string {
  const m = merchantById(order.merchantId);
  const mins = minutesInState(order, now);
  const late = overdue(order, now);
  const parts = [
    `${m.name} a ${order.dropBarrio}`,
    `${mins} minutos en este estado`,
    late ? `demorado ${late} minutos` : null,
    order.hasOpenIncident ? `incidencia abierta: ${order.incident}` : null,
  ];
  return parts.filter(Boolean).join(', ');
}

/** Tiempo en el estado: la cifra que el despachador mira primero. Ámbar cuando pasa el SLA. */
export function AgeBadge({
  order,
  now,
  size = 'sm',
}: {
  order: DemoOrder;
  now: string;
  size?: 'sm' | 'md';
}) {
  const mins = minutesInState(order, now);
  const late = overdue(order, now);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-xs font-numeric font-semibold leading-none',
        size === 'sm' ? 'h-6 px-1.5 text-[0.9375rem]' : 'h-7 px-2 text-base',
        late ? 'bg-tone-amber-bg text-tone-amber-fg' : 'text-muted-foreground',
      )}
    >
      {late ? <Clock3 aria-hidden="true" className="size-3.5" /> : null}
      {formatMinutes(mins)}
      {late ? <span className="text-[0.8em] font-medium">+{late}</span> : null}
    </span>
  );
}

export function IncidentFlag({ label, className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1 rounded-xs bg-tone-red-bg px-1.5 py-0.5 text-xs font-semibold leading-4 text-tone-red-fg',
        className,
      )}
    >
      <Flag aria-hidden="true" className="size-3 shrink-0 fill-current" />
      <span className="truncate">{label ?? 'Incidencia abierta'}</span>
    </span>
  );
}

export interface OrderCardProps {
  order: DemoOrder;
  now: string;
  focused: boolean;
  selected: boolean;
  moving: boolean;
  onFocusCard: () => void;
  onOpen: () => void;
  onToggleSelect: () => void;
  /** Disparador de asignación (Popover) para pedidos por asignar. */
  assignSlot?: (trigger: ReactNode) => ReactNode;
  ref?: Ref<HTMLElement>;
}

export function OrderCard({
  order,
  now,
  focused,
  selected,
  moving,
  onFocusCard,
  onOpen,
  onToggleSelect,
  assignSlot,
  ref,
}: OrderCardProps) {
  const merchant = merchantById(order.merchantId);
  const courier = courierById(order.courierId);
  const late = overdue(order, now) > 0;
  const inner = focused ? 0 : -1;
  const assignable = order.status === 'PENDIENTE_ASIGNACION';

  const assignTrigger = (
    <button
      type="button"
      tabIndex={inner}
      aria-label={`Asignar ${order.id}`}
      className="inline-flex h-7 items-center gap-1.5 rounded-sm border pointer-coarse:h-11 pointer-coarse:px-3 border-input bg-card px-2 text-xs font-semibold hover:border-foreground/60 hover:bg-subtle"
    >
      <UserPlus aria-hidden="true" className="size-3.5" />
      Asignar
    </button>
  );

  return (
    <article
      ref={ref}
      tabIndex={focused ? 0 : -1}
      data-order-id={order.id}
      aria-labelledby={`${order.id}-code`}
      aria-describedby={`${order.id}-desc`}
      onFocus={(e) => {
        if (e.target === e.currentTarget) onFocusCard();
      }}
      onDoubleClick={onOpen}
      style={moving ? { viewTransitionName: vtName('order', order.id) } : undefined}
      className={cn(
        'group/card relative flex flex-col gap-(--card-gap) rounded-md border bg-card p-(--card-pad) text-[0.8125rem] outline-none',
        'transition-[border-color,box-shadow] duration-(--dur-fast)',
        'hover:border-foreground/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        late && 'shadow-[inset_3px_0_0_var(--tone-amber-solid)]',
        order.hasOpenIncident && 'shadow-[inset_3px_0_0_var(--tone-red-solid)]',
        selected && 'border-brand ring-1 ring-brand',
        order.isNew && 'animate-trace',
      )}
    >
      <p id={`${order.id}-desc`} className="sr-only">
        {orderSummary(order, now)}
      </p>
      <div className="flex items-center gap-2">
        {assignable ? (
          <span className="relative z-[1] -m-1.5 grid size-7 shrink-0 place-items-center pointer-coarse:-m-3 pointer-coarse:size-11">
            <input
              type="checkbox"
              tabIndex={inner}
              checked={selected}
              onChange={onToggleSelect}
              aria-label={`Seleccionar ${order.id}`}
              className="size-4 cursor-pointer accent-(--brand) pointer-coarse:size-5"
            />
          </span>
        ) : null}
        <button
          type="button"
          id={`${order.id}-code`}
          tabIndex={inner}
          onClick={onOpen}
          className="min-w-0 truncate rounded-xs font-numeric text-[0.9375rem] font-semibold tracking-[0.01em] hover:underline hover:underline-offset-2 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
        >
          {order.id}
        </button>
        <span className="ml-auto">
          <AgeBadge order={order} now={now} />
        </span>
      </div>

      <div className="min-w-0 leading-5">
        <p className="truncate font-semibold">{merchant.name}</p>
        <p className="truncate text-muted-foreground">
          <span aria-hidden="true">→ </span>
          {order.dropBarrio}
          {order.city !== 'Asunción' && order.city !== order.dropBarrio ? `, ${order.city}` : ''}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <OrderStatusPill status={order.status} short />
        <span className="ml-auto whitespace-nowrap font-numeric text-[0.875rem] font-medium">
          {order.amount > 0 ? formatPYG(order.amount) : PAYMENT_METHOD_LABEL[order.method]}
        </span>
      </div>

      {order.hasOpenIncident || order.window ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {order.hasOpenIncident ? <IncidentFlag label={order.incident} /> : null}
          {order.window ? (
            <span className="rounded-xs bg-muted px-1.5 py-0.5 text-xs font-semibold leading-4">
              Entre {order.window}
            </span>
          ) : null}
        </div>
      ) : null}

      <OrderRail status={order.status} />

      <div className="relative z-[1] flex min-h-7 items-center gap-2">
        {courier ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar name={courier.name} size="xs" />
            <span className="truncate font-medium">{shortName(courier.name)}</span>
          </span>
        ) : order.status === 'RECIBIDO' ? (
          <span className="text-muted-foreground">Validando datos</span>
        ) : (
          <span className="text-muted-foreground">Sin repartidor</span>
        )}
        {assignable && assignSlot ? (
          <span className="ml-auto">{assignSlot(assignTrigger)}</span>
        ) : null}
      </div>
    </article>
  );
}
