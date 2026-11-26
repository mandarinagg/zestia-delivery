import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold',
    'transition-[background-color,color,border-color,transform] duration-(--dur-fast) ease-(--ease-standard)',
    'active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    'disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-raised hover:bg-primary/88',
        secondary: 'bg-muted text-foreground hover:bg-accent',
        outline:
          'border border-input bg-card text-foreground hover:border-foreground/60 hover:bg-subtle',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        link: 'h-auto px-0 text-foreground underline decoration-input underline-offset-4 hover:decoration-foreground',
      },
      size: {
        xs: 'h-7 gap-1.5 rounded-sm px-2 text-xs pointer-coarse:h-11 [&_svg]:size-3.5',
        sm: 'h-8 gap-1.5 px-3 text-[0.8125rem] pointer-coarse:h-11 [&_svg]:size-4',
        default: 'h-9 px-4 text-sm pointer-coarse:h-11 [&_svg]:size-4',
        lg: 'h-11 px-5 text-[0.9375rem] [&_svg]:size-5',
        /** Botón de pulgar (PWA repartidor): 56 px de alto. */
        xl: 'h-14 rounded-lg px-6 text-lg [&_svg]:size-6',
        icon: 'size-9 pointer-coarse:size-11 [&_svg]:size-4',
        'icon-sm': 'size-8 pointer-coarse:size-11 [&_svg]:size-4',
        'icon-lg': 'size-11 [&_svg]:size-5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
