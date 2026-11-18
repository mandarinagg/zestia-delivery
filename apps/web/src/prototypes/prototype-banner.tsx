import { Link } from '@tanstack/react-router';
import { FlaskConical } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Rótulo obligatorio de todo prototipo: deja claro que los datos son de ejemplo
 * y que nada se guarda. Va arriba de la pantalla, antes del contenido.
 */
export function PrototypeBanner({
  children,
  className,
  backTo = '/panel/ui',
}: {
  children?: ReactNode;
  className?: string;
  backTo?: string | null;
}) {
  return (
    <div
      role="note"
      aria-label="Prototipo"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-dashed border-brand/60 bg-brand-soft px-3 py-1.5 text-[0.8125rem] text-foreground',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5 font-semibold text-brand-ink">
        <FlaskConical aria-hidden="true" className="size-4" />
        Prototipo
      </span>
      <span className="min-w-0 flex-1">
        {children ?? 'Datos de ejemplo. Nada de lo que hagas acá se guarda ni se envía.'}
      </span>
      {backTo ? (
        <Link
          to={backTo}
          className="rounded-xs font-semibold text-brand-ink underline underline-offset-4"
        >
          Guía de UI
        </Link>
      ) : null}
    </div>
  );
}
