import type { InputHTMLAttributes, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const control = [
  'w-full rounded-sm border border-input bg-card px-2.5 text-sm text-foreground',
  'placeholder:text-muted-foreground transition-[border-color] duration-(--dur-fast)',
  'hover:border-foreground/70 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'aria-invalid:border-destructive aria-invalid:outline-destructive',
].join(' ');

export function Input({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <input ref={ref} className={cn(control, 'h-9 pointer-coarse:h-11', className)} {...props} />
  );
}

export function Textarea({
  className,
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} className={cn(control, 'min-h-20 py-2', className)} {...props} />;
}

const chevron =
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='%23767b9c' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 4.5l3 3 3-3'/%3E%3C/svg%3E\")]";

/** Select nativo estilizado: accesible por teclado y en móvil sin dependencias. */
export function Select({
  className,
  ref,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return (
    <select
      ref={ref}
      className={cn(
        control,
        chevron,
        'h-9 appearance-none pointer-coarse:h-11 bg-[length:12px] bg-[right_0.6rem_center] bg-no-repeat pr-8',
        className,
      )}
      {...props}
    />
  );
}

export function Checkbox({
  className,
  ref,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn('size-4 shrink-0 cursor-pointer accent-primary', className)}
      {...props}
    />
  );
}
