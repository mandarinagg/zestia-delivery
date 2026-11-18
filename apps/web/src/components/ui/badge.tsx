import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badge = cva(
  'inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-xs font-semibold leading-4',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-muted text-foreground',
        outline: 'border border-input text-foreground',
        /** Lo nuevo / lo tuyo: tinte lapacho. */
        brand: 'bg-brand-soft text-brand-ink',
      },
    },
    defaultVariants: { variant: 'secondary' },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badge> {}

/** Etiqueta o contador genérico. Para estados operativos usá StatusPill u OrderStatusPill. */
export function Badge({ variant, className, ...props }: BadgeProps) {
  return <span className={cn(badge({ variant }), className)} {...props} />;
}
