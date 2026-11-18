import type { HTMLAttributes } from 'react';
import {
  CASH_META,
  STATUS_META,
  type CashStatus,
  type OrderStatus,
  type Tone,
} from '@/lib/order-states';
import { cn } from '@/lib/utils';
import { resolveTone, TONE_CLASS, type StatusTone } from './tone';

export type { StatusTone } from './tone';

const pillBase =
  'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-xs px-1.5 py-0.5 text-xs font-semibold leading-4';

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone | StatusTone;
}

/** Etiqueta de estado genérica: texto + marca + color. El significado nunca depende solo del color. */
export function StatusPill({ tone = 'neutral', className, children, ...props }: StatusPillProps) {
  const t = TONE_CLASS[resolveTone(tone)];
  return (
    <span className={cn(pillBase, t.bg, t.fg, className)} {...props}>
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', t.solid)} />
      {children}
    </span>
  );
}

const C = 7;
function piePath(fraction: number, r = 3.6): string {
  if (fraction >= 1) return `M${C} ${C - r}A${r} ${r} 0 1 1 ${C - 0.001} ${C - r}Z`;
  const a = fraction * Math.PI * 2;
  const x = C + r * Math.sin(a);
  const y = C - r * Math.cos(a);
  return `M${C} ${C}L${C} ${C - r}A${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`;
}

/**
 * Glifo del estado: un anillo que se llena a medida que el pedido avanza por el camino feliz.
 * Los desvíos tienen forma propia (cruz, flecha de vuelta, barra), así se distinguen sin color.
 */
export function StatusGlyph({ status, className }: { status: OrderStatus; className?: string }) {
  const meta = STATUS_META[status];
  const color = TONE_CLASS[meta.tone].text;
  const ring = <circle cx={C} cy={C} r={6} fill="none" stroke="currentColor" strokeWidth={1.5} />;
  let inner;
  switch (status) {
    case 'RECIBIDO':
      inner = (
        <circle
          cx={C}
          cy={C}
          r={6}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="2.4 2.3"
        />
      );
      break;
    case 'ENTREGADO':
      inner = (
        <>
          <circle cx={C} cy={C} r={6.75} fill="currentColor" />
          <path d="M4.2 7.2l1.9 1.9 3.8-4" fill="none" stroke="var(--card)" strokeWidth={1.6} />
        </>
      );
      break;
    case 'NO_ENTREGADO':
      inner = (
        <>
          <circle cx={C} cy={C} r={6.75} fill="currentColor" />
          <path d="M4.8 4.8l4.4 4.4M9.2 4.8l-4.4 4.4" stroke="var(--card)" strokeWidth={1.6} />
        </>
      );
      break;
    case 'EN_DEVOLUCION':
    case 'DEVUELTO':
      inner = (
        <>
          {status === 'DEVUELTO' ? <circle cx={C} cy={C} r={6.75} fill="currentColor" /> : ring}
          <path
            d="M9.6 9.4V7.6a1.8 1.8 0 0 0-1.8-1.8H4.6m1.6-1.7L4.5 5.8l1.7 1.7"
            fill="none"
            stroke={status === 'DEVUELTO' ? 'var(--card)' : 'currentColor'}
            strokeWidth={1.4}
          />
        </>
      );
      break;
    case 'CANCELADO':
      inner = (
        <>
          {ring}
          <path d="M3 11L11 3" stroke="currentColor" strokeWidth={1.5} />
        </>
      );
      break;
    default:
      inner = (
        <>
          {ring}
          <path d={piePath((meta.step ?? 0) / 7)} fill="currentColor" />
        </>
      );
  }
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden="true"
      className={cn('size-3.5 shrink-0', color, className)}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {inner}
    </svg>
  );
}

export interface OrderStatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  status: OrderStatus;
  /** Usa la etiqueta corta (tarjetas, celdas densas). */
  short?: boolean;
}

export function OrderStatusPill({ status, short, className, ...props }: OrderStatusPillProps) {
  const meta = STATUS_META[status];
  const t = TONE_CLASS[meta.tone];
  return (
    <span
      className={cn(pillBase, t.bg, t.fg, status === 'CANCELADO' && 'line-through', className)}
      title={short ? meta.label : undefined}
      {...props}
    >
      <StatusGlyph status={status} />
      {short ? meta.short : meta.label}
    </span>
  );
}

export function CashStatusPill({
  status,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { status: CashStatus }) {
  const meta = CASH_META[status];
  const t = TONE_CLASS[meta.tone];
  return (
    <span className={cn(pillBase, 'bg-transparent ring-1 ring-inset', t.fg, className)} {...props}>
      <span aria-hidden="true" className={cn('font-numeric text-[0.8rem] leading-none', t.text)}>
        Gs
      </span>
      {meta.label}
    </span>
  );
}
