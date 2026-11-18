import { cn } from '@/lib/utils';

/**
 * Marca: una "Z" trazada como recorrido — sale de un punto de retiro (lleno) y llega a un
 * destino (anillo). Es el mismo lenguaje del riel de estado: origen, tramo, llegada.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      className={cn('size-7 shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="28" height="28" rx="7" fill="var(--brand)" />
      <path
        d="M8.5 9h10.5L9 19h10.5"
        fill="none"
        stroke="var(--brand-foreground)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="7.6" cy="9" r="2.1" fill="var(--brand-foreground)" />
      <circle
        cx="20.4"
        cy="19"
        r="2.2"
        fill="var(--brand)"
        stroke="var(--brand-foreground)"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1 font-display text-[1.0625rem] leading-none',
        className,
      )}
    >
      <span className="font-bold tracking-[0.02em]">ZESTIA</span>
      <span className="font-medium opacity-80">Delivery</span>
    </span>
  );
}
