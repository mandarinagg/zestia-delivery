import { AlertCircle, Info } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

/** Error de un formulario de cuenta: se anuncia (`role="alert"`) y toma el foco al aparecer. */
export function FormAlert({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [children]);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="mt-6 flex gap-2.5 rounded-md border border-tone-red-solid/40 bg-tone-red-bg p-3 text-sm text-tone-red-fg outline-none focus-visible:outline-2 focus-visible:outline-ring"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

/**
 * Aviso informativo de la pantalla (no es un error): por qué se cerró la sesión. Toma el foco al
 * aparecer, como `FormAlert`: una región `role="status"` que ya está en la página al cargar no
 * se anuncia sola, y así quien usa lector de pantalla lo escucha.
 */
export function FormNotice({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      className="mt-6 flex gap-2.5 rounded-md border border-tone-blue-solid/40 bg-tone-blue-bg p-3 text-sm text-tone-blue-fg outline-none focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
