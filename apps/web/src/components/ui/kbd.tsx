import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Tecla de atajo. Usar dentro de un texto que ya explique la acción. */
export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-b-2 bg-card px-1 font-sans text-[0.6875rem] font-semibold leading-none text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
