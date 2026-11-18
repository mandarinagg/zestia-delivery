import { AlertCircle } from 'lucide-react';
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
