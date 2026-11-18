import { cn } from '@/lib/utils';

export function initials(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/**
 * Iniciales de una persona (repartidor, usuario). Decorativo: el nombre siempre va en texto
 * al lado o en el nombre accesible del control que lo contiene.
 */
export function Avatar({
  name,
  size = 'sm',
  className,
}: {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full bg-accent font-display font-semibold text-accent-foreground',
        size === 'xs' && 'size-5 text-[0.625rem]',
        size === 'sm' && 'size-6 text-[0.6875rem]',
        size === 'md' && 'size-8 text-xs',
        size === 'lg' && 'size-11 text-base',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
