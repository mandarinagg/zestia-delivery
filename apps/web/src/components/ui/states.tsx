import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-sm bg-muted motion-reduce:animate-none', className)}
      {...props}
    />
  );
}

/**
 * Envuelve el contenido que reemplaza a un esqueleto: aparece con un fundido corto (180 ms)
 * en vez de "saltar". Sin escalonar ni deslizar: el contenido ocupa el lugar del esqueleto.
 */
export function Reveal({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-fade-in', className)} {...props} />;
}

const box = 'flex flex-col items-center justify-center gap-3 px-6 py-10 text-center';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Acción principal: un vacío es una invitación a actuar. */
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div className={cn(box, className)}>
      <span
        aria-hidden="true"
        className="grid size-11 place-items-center rounded-md border border-dashed border-input text-muted-foreground"
      >
        {icon ?? <Inbox className="size-5" />}
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="font-display text-lg font-semibold leading-6">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  description?: string;
  /** Si se pasa, muestra el botón "Reintentar". */
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'No pudimos cargar los datos',
  description = 'Revisá tu conexión e intentá de nuevo.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div role="alert" className={cn(box, className)}>
      <span
        aria-hidden="true"
        className="grid size-11 place-items-center rounded-md bg-tone-red-bg text-tone-red-fg"
      >
        <AlertTriangle className="size-5" />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="font-display text-lg font-semibold leading-6">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingState({
  label = 'Cargando…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={cn(box, 'text-muted-foreground', className)}>
      <Loader2 aria-hidden="true" className="size-6 animate-spin motion-reduce:animate-none" />
      <span>{label}</span>
    </div>
  );
}

/** Esqueleto de tabla para la primera carga. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando tabla"
      className="flex flex-col divide-y"
    >
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex h-(--row-h) items-center gap-4 px-3">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn('h-3', c === 0 ? 'w-20' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}
