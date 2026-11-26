/*
 * Restablecer contraseña (`POST /auth/reset-password`).
 *
 * El token llega en el fragmento: `/restablecer-contrasena#token=…`. El fragmento no viaja al
 * servidor ni queda en logs de acceso; igual lo sacamos de la barra de direcciones apenas lo
 * leemos, para que no quede en el historial ni en una captura de pantalla.
 *
 * El servidor revoca todas las sesiones al restablecer: después hay que volver a ingresar.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useRouter } from '@tanstack/react-router';
import { passwordResetTokenSchema } from '@zestia/contracts';
import { CircleCheck, Link2Off } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button, buttonVariants } from '@/components/ui/button';
import { ApiError, describeApiError } from '@/lib/api';
import { storeSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { AuthShell, PasswordField, Requirement, authLinkClass } from './auth-shell';
import { MIN_PASSWORD, authApi, resetSchema, tokenFromHash, type ResetValues } from './auth-api';
import { FormAlert } from './form-alert';

function InvalidLink({ hadToken }: { hadToken: boolean }) {
  return (
    <AuthShell title="Este enlace ya no sirve">
      <div className="mt-4 flex gap-2.5 text-base text-muted-foreground">
        <Link2Off aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <p>
          {hadToken
            ? 'Venció o ya se usó. Los enlaces para restablecer sirven una sola vez y por poco tiempo.'
            : 'Le falta una parte. Abrilo de nuevo desde el correo, sin recortarlo.'}
        </p>
      </div>
      <Link to="/olvide-contrasena" className={cn(buttonVariants({ size: 'lg' }), 'mt-6 w-full')}>
        Pedir un enlace nuevo
      </Link>
      <Link to="/ingreso" className={cn(authLinkClass, 'mt-2 self-start')}>
        Volver al ingreso
      </Link>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hash, pathname } = useLocation();
  const [token, setToken] = useState<string | null>(() => tokenFromHash(hash));
  const [seenHash, setSeenHash] = useState(hash);
  const [state, setState] = useState<'form' | 'done' | 'expired'>('form');
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLSpanElement>(null);

  // Un enlace nuevo (otro fragmento) reinicia la pantalla. Se deriva en el render, sin efecto.
  if (hash !== seenHash) {
    setSeenHash(hash);
    const fromHash = tokenFromHash(hash);
    if (fromHash) {
      setToken(fromHash);
      setState('form');
    }
  }

  // Ya leído, el token sale de la barra de direcciones (reemplazando, sin sumar historial).
  useEffect(() => {
    if (tokenFromHash(hash)) router.history.replace(pathname);
  }, [hash, pathname, router]);

  useEffect(() => {
    if (state === 'done') headingRef.current?.focus();
  }, [state]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirm: '' },
  });
  const [password, confirm] = useWatch({ control, name: ['password', 'confirm'] });

  if (state === 'done') {
    return (
      <AuthShell
        title={
          <span ref={headingRef} tabIndex={-1} className="outline-none">
            Listo, ya tenés contraseña nueva
          </span>
        }
      >
        <p className="mt-4 flex gap-2.5 text-base text-muted-foreground">
          <CircleCheck
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-tone-green-solid"
          />
          Por seguridad cerramos todas tus sesiones. Ingresá con tu correo y la contraseña que
          acabás de crear.
        </p>
        <Link to="/ingreso" className={cn(buttonVariants({ size: 'lg' }), 'mt-6 w-full')}>
          Ir al ingreso
        </Link>
      </AuthShell>
    );
  }

  // Un token con formato inválido no puede ser bueno: no hace falta preguntarle al servidor.
  if (!token || !passwordResetTokenSchema.safeParse(token).success || state === 'expired') {
    return <InvalidLink hadToken={token !== null} />;
  }

  return (
    <AuthShell title="Creá tu contraseña nueva" lead="Después vas a ingresar con ella.">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <form
        noValidate
        aria-label="Restablecer contraseña"
        className="mt-6 flex flex-col gap-4"
        onSubmit={handleSubmit(async (values) => {
          setError(null);
          try {
            await authApi.resetPassword(token, values.password);
            storeSession(queryClient, null);
            setState('done');
          } catch (e) {
            if (e instanceof ApiError && e.code === 'INVALID_OR_EXPIRED_TOKEN') {
              setState('expired');
              return;
            }
            setError(describeApiError(e));
          }
        })}
      >
        <PasswordField
          label="Contraseña nueva"
          autoComplete="new-password"
          aria-describedby="reset-reqs"
          error={errors.password?.message}
          {...register('password')}
        />
        <PasswordField
          label="Repetir contraseña"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register('confirm')}
        />
        <ul id="reset-reqs" className="flex flex-col gap-1.5 text-sm">
          <Requirement met={password.length >= MIN_PASSWORD}>
            {`Al menos ${MIN_PASSWORD} caracteres`}
          </Requirement>
          <Requirement met={password.length > 0 && password === confirm}>
            Las dos coinciden
          </Requirement>
        </ul>
        <p className="text-[0.8125rem] text-muted-foreground">
          Una frase larga es más fácil de recordar y más difícil de adivinar.
        </p>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isSubmitting}
          aria-busy={isSubmitting || undefined}
        >
          {isSubmitting ? 'Guardando…' : 'Guardar contraseña'}
        </Button>
      </form>
    </AuthShell>
  );
}
