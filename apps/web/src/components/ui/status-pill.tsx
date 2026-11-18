import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const pill = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        neutral: 'bg-status-neutral-bg text-status-neutral-fg',
        info: 'bg-status-info-bg text-status-info-fg',
        success: 'bg-status-success-bg text-status-success-fg',
        warning: 'bg-status-warning-bg text-status-warning-fg',
        danger: 'bg-status-danger-bg text-status-danger-fg',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

const dot: Record<StatusTone, string> = {
  neutral: 'bg-status-neutral-dot',
  info: 'bg-status-info-dot',
  success: 'bg-status-success-dot',
  warning: 'bg-status-warning-dot',
  danger: 'bg-status-danger-dot',
};

export interface StatusPillProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof pill> {}

/** Estado con texto + punto: el significado nunca depende solo del color. */
export function StatusPill({ tone = 'neutral', className, children, ...props }: StatusPillProps) {
  const t = tone ?? 'neutral';
  return (
    <span className={cn(pill({ tone: t }), className)} {...props}>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', dot[t])} />
      {children}
    </span>
  );
}
