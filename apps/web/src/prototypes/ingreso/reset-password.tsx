/*
 * PROTOTIPO — Restablecer contraseña (solo visual, sin API).
 *
 * Como en la autenticación real (#14), el token llega en el fragmento:
 * `/restablecer-contrasena#token=…`. El fragmento no viaja al servidor ni queda en logs de
 * acceso; igual lo sacamos de la barra de direcciones apenas lo leemos, para que no quede en el
 * historial ni en una captura de pantalla.
 *
 * Tokens de ejemplo: cualquiera es válido salvo `demo-enlace-vencido`.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useRouter } from '@tanstack/react-router';
import { Check, CircleCheck, Link2Off } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AuthShell, PasswordField, authLinkClass } from './auth-shell';

/** Largo mínimo provisorio; se alinea con la política que defina #14. */
export const MIN_PASSWORD = 10;
export const EXPIRED_DEMO_TOKEN = 'demo-enlace-vencido';

export function tokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('token');
  return token && token.trim() ? token.trim() : null;
}

const resetSchema = z
  .object({
    password: z
      .string()
      .min(1, 'Ingresá una contraseña nueva.')
      .min(MIN_PASSWORD, `Usá al menos ${MIN_PASSWORD} caracteres.`),
    confirm: z.string().min(1, 'Repetí la contraseña.'),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Las contraseñas no coinciden.',
  });
type ResetValues = z.infer<typeof resetSchema>;

function DemoLinks() {
  const link = 'rounded-xs font-semibold text-brand-ink underline underline-offset-4';
  return (
    <>
      Probá el enlace:{' '}
      <Link to="/prototipo/restablecer-contrasena" hash="token=demo-enlace-valido" className={link}>
        válido
      </Link>
      ,{' '}
      <Link
        to="/prototipo/restablecer-contrasena"
        hash={`token=${EXPIRED_DEMO_TOKEN}`}
        className={link}
      >
        vencido
      </Link>
      .
    </>
  );
}

function Requirement({ met, children }: { met: boolean; children: string }) {
  return (
    <li
      className={cn('flex items-center gap-2', met ? 'text-foreground' : 'text-muted-foreground')}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-4 place-items-center rounded-full border',
          met ? 'border-tone-green-solid bg-tone-green-solid text-background' : 'border-input',
        )}
      >
        {met ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      {children}
      <span className="sr-only">{met ? ' (cumplido)' : ' (pendiente)'}</span>
    </li>
  );
}

export function ResetPasswordPrototype() {
  const router = useRouter();
  const { hash, pathname } = useLocation();
  const [token, setToken] = useState<string | null>(() => tokenFromHash(hash));
  const [seenHash, setSeenHash] = useState(hash);
  const [done, setDone] = useState(false);
  const headingRef = useRef<HTMLSpanElement>(null);

  // Un enlace nuevo (otro fragmento) reinicia la pantalla. Se deriva en el render, sin efecto.
  if (hash !== seenHash) {
    setSeenHash(hash);
    const fromHash = tokenFromHash(hash);
    if (fromHash) {
      setToken(fromHash);
      setDone(false);
    }
  }

  // Ya leído, el token sale de la barra de direcciones (reemplazando, sin sumar historial).
  useEffect(() => {
    if (tokenFromHash(hash)) router.history.replace(pathname);
  }, [hash, pathname, router]);

  useEffect(() => {
    if (done) headingRef.current?.focus();
  }, [done]);

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

  if (done) {
    return (
      <AuthShell
        banner="No se cambió nada: es un prototipo."
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
          Ingresá con tu correo y la contraseña que acabás de crear.
        </p>
        <Link to="/prototipo/ingreso" className={cn(buttonVariants({ size: 'lg' }), 'mt-6 w-full')}>
          Ir al ingreso
        </Link>
      </AuthShell>
    );
  }

  if (!token || token === EXPIRED_DEMO_TOKEN) {
    return (
      <AuthShell banner={<DemoLinks />} title="Este enlace ya no sirve">
        <div className="mt-4 flex gap-2.5 text-base text-muted-foreground">
          <Link2Off aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <p>
            {token
              ? 'Venció o ya se usó. Los enlaces para restablecer sirven una sola vez y por poco tiempo.'
              : 'Le falta una parte. Abrilo de nuevo desde el correo, sin recortarlo.'}
          </p>
        </div>
        <Link
          to="/prototipo/olvide-contrasena"
          className={cn(buttonVariants({ size: 'lg' }), 'mt-6 w-full')}
        >
          Pedir un enlace nuevo
        </Link>
        <Link to="/prototipo/ingreso" className={cn(authLinkClass, 'mt-2 self-start')}>
          Volver al ingreso
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      banner={<DemoLinks />}
      title="Creá tu contraseña nueva"
      lead="Después vas a ingresar con ella."
    >
      <form
        noValidate
        aria-label="Restablecer contraseña"
        className="mt-6 flex flex-col gap-4"
        onSubmit={handleSubmit(async () => {
          await new Promise((r) => setTimeout(r, 400));
          setDone(true);
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
