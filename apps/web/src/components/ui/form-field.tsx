import { cloneElement, useId } from 'react';
import type { LabelHTMLAttributes, ReactElement } from 'react';
import { cn } from '@/lib/utils';

export function Label({
  className,
  required,
  children,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn('text-sm font-medium leading-none', className)} {...props}>
      {children}
      {required ? (
        <span aria-hidden="true" className="ml-0.5 text-destructive">
          *
        </span>
      ) : null}
    </label>
  );
}

interface ControlProps {
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}

export interface FormFieldProps {
  label: string;
  /** Un único control (Input, Select, Textarea...). Se le inyectan id y aria-*. */
  children: ReactElement<ControlProps>;
  required?: boolean;
  help?: string;
  error?: string;
  className?: string;
}

/**
 * Campo de formulario: etiqueta, marca de obligatorio, ayuda y error.
 * El error se anuncia (role="alert") y queda enlazado con aria-describedby.
 */
export function FormField({ label, children, required, help, error, className }: FormFieldProps) {
  const uid = useId();
  const helpId = `${uid}-help`;
  const errorId = `${uid}-error`;
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={uid} required={required}>
        {label}
        {required ? <span className="sr-only"> (obligatorio)</span> : null}
      </Label>
      {cloneElement(children, {
        id: uid,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
        'aria-required': required || undefined,
      })}
      {help ? (
        <p id={helpId} className="text-xs text-muted-foreground">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
