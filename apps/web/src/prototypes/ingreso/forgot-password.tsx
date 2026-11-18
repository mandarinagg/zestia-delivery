/*
 * PROTOTIPO — Pedir un enlace para restablecer la contraseña (solo visual, sin API).
 * La confirmación es la misma exista o no la cuenta: no revela qué correos están registrados.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { AuthShell, authLinkClass } from './auth-shell';
import { loginSchema } from './login';

const forgotSchema = loginSchema.pick({ email: true });
type ForgotValues = z.infer<typeof forgotSchema>;

function BackToLogin() {
  return (
    <Link to="/prototipo/ingreso" className={cn(authLinkClass, 'gap-1.5 self-start')}>
      <ArrowLeft aria-hidden="true" className="size-4" />
      Volver al ingreso
    </Link>
  );
}

export function ForgotPasswordPrototype() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  useEffect(() => {
    if (sentTo) statusRef.current?.focus();
  }, [sentTo]);

  if (sentTo) {
    return (
      <AuthShell banner="No se envió ningún correo: es un prototipo." title="Revisá tu correo">
        <div
          ref={statusRef}
          tabIndex={-1}
          role="status"
          className="mt-6 flex gap-3 rounded-md border bg-card p-4 outline-none focus-visible:outline-2 focus-visible:outline-ring"
        >
          <MailCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-tone-green-solid" />
          <div className="flex flex-col gap-1 text-sm">
            <p>
              Si hay una cuenta con <span className="font-semibold">{sentTo}</span>, te llega un
              enlace para crear una contraseña nueva.
            </p>
            <p className="text-muted-foreground">
              El enlace sirve una sola vez y vence en poco tiempo. Si no lo ves, mirá en correo no
              deseado.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            to="/prototipo/restablecer-contrasena"
            hash="token=demo-enlace-valido"
            className={authLinkClass}
          >
            Abrir el enlace de ejemplo
          </Link>
          <button
            type="button"
            className={cn(authLinkClass, 'self-start')}
            onClick={() => {
              setSentTo(null);
              setTimeout(() => setFocus('email'), 0);
            }}
          >
            Usar otro correo
          </button>
          <BackToLogin />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      banner="Solo visual. No se envía ningún correo."
      title="¿Olvidaste tu contraseña?"
      lead="Te mandamos un enlace para crear una nueva."
    >
      <form
        noValidate
        aria-label="Recuperar contraseña"
        className="mt-6 flex flex-col gap-4"
        onSubmit={handleSubmit(async (values) => {
          await new Promise((r) => setTimeout(r, 400));
          setSentTo(values.email);
        })}
      >
        <FormField label="Correo" required error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="username"
            inputMode="email"
            className="h-11 text-base"
            {...register('email')}
          />
        </FormField>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isSubmitting}
          aria-busy={isSubmitting || undefined}
        >
          {isSubmitting ? 'Enviando…' : 'Enviar enlace'}
        </Button>
        <BackToLogin />
      </form>
    </AuthShell>
  );
}
