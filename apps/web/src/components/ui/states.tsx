import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

const box = 'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center';

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
      <span aria-hidden="true" className="rounded-full bg-muted p-3 text-muted-foreground">
        {icon ?? <Inbox className="size-6" />}
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-base font-semibold">{title}</p>
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
        className="rounded-full bg-status-danger-bg p-3 text-status-danger-fg"
      >
        <AlertTriangle className="size-6" />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-base font-semibold">{title}</p>
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
      className="flex flex-col gap-2 p-3"
    >
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className="h-6 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
