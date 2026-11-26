import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { ApiError, describeApiError } from '@/lib/api';
import { activeMembership, homeFor, storeSession } from '@/lib/session';
import { clearSessionDeadlines } from '@/lib/session-clock';
import { AuthShell, PasswordField, authLinkClass } from './auth-shell';
import { authApi, loginSchema, safeRedirect, type LoginValues } from './auth-api';
import { FormAlert, FormNotice } from './form-alert';

/**
 * Ingreso con correo y contraseña (`POST /auth/login`). La sesión queda en una cookie httpOnly;
 * acá no se guarda nada. El error de credenciales es genérico: no revela si el correo existe.
 *
 * Con una sola empresa activa el servidor ya la fija y se entra directo; con varias, se pasa
 * al selector de empresa.
 */
export function LoginPage({
  redirect,
  reason,
}: {
  redirect?: string;
  /** Por qué se cerró la sesión anterior (aviso de vencimiento del panel). */
  reason?: 'idle' | 'absolute';
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  return (
    <AuthShell title="Ingresá al panel" lead="Con el correo de tu empresa.">
      {reason && !error ? (
        <FormNotice>
          {reason === 'idle'
            ? 'Tu sesión se cerró por inactividad. Ingresá de nuevo para seguir.'
            : 'Tu sesión llegó a su duración máxima. Ingresá de nuevo para seguir.'}
        </FormNotice>
      ) : null}
      {error ? <FormAlert>{error}</FormAlert> : null}

      <form
        noValidate
        aria-label="Ingreso"
        className="mt-6 flex flex-col gap-4"
        onSubmit={handleSubmit(async (values) => {
          setError(null);
          try {
            // Sesión nueva: se olvidan los vencimientos de una anterior (otra persona, otro día).
            clearSessionDeadlines();
            const session = await authApi.login(values.email, values.password);
            storeSession(queryClient, session);
            const membership = activeMembership(session);
            const target = safeRedirect(redirect);
            if (membership) {
              await navigate({ href: target ?? homeFor(membership.role) });
            } else {
              await navigate({ to: '/ingreso/empresa', search: { redirect: target ?? undefined } });
            }
          } catch (e) {
            setError(
              e instanceof ApiError && e.code === 'INVALID_CREDENTIALS'
                ? 'El correo o la contraseña no coinciden. Revisalos o pedí un enlace para crear una contraseña nueva.'
                : describeApiError(e),
            );
          }
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
        <PasswordField
          label="Contraseña"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Link to="/olvide-contrasena" className={`${authLinkClass} self-start`}>
          ¿Olvidaste tu contraseña?
        </Link>
        <Button
          type="submit"
          size="lg"
          className="mt-2 w-full"
          disabled={isSubmitting}
          aria-busy={isSubmitting || undefined}
        >
          {isSubmitting ? 'Ingresando…' : 'Ingresar'}
        </Button>
        <p className="text-[0.8125rem] text-muted-foreground">
          La sesión se cierra sola después de un rato sin uso. En equipos compartidos, cerrala al
          terminar.
        </p>
      </form>
    </AuthShell>
  );
}
