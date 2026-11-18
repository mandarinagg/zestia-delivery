import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Contador opcional (p. ej. pedidos en la columna). */
  count?: number;
}

/**
 * Control segmentado (radiogroup): una sola opción activa, flechas para moverse,
 * solo la opción activa entra en el orden de tabulación.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'sm',
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent, index: number) {
    const delta =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-md bg-muted p-0.5', className)}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-semibold text-muted-foreground transition-[background-color,color] duration-(--dur-fast) hover:text-foreground',
              size === 'sm'
                ? 'h-7 px-2.5 text-[0.8125rem] pointer-coarse:h-11'
                : 'h-11 px-4 text-base',
              active && 'bg-card text-foreground shadow-raised',
            )}
          >
            {o.label}
            {o.count !== undefined ? ' ' : null}
            {o.count !== undefined ? (
              <span className="font-numeric text-[0.9em] text-muted-foreground">{o.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
