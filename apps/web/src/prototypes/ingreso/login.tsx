/*
 * PROTOTIPO — Ingreso y selector de empresa (solo visual). No hay llamada a la API.
 *
 * Cómo encaja con la autenticación real (#14):
 * - La sesión vive en una cookie del servidor (httpOnly); el front no guarda tokens. Los POST
 *   llevan el encabezado `X-CSRF-Token`.
 * - La respuesta del ingreso trae `user`, `memberships` y `activeTenantId`. Con una sola
 *   membresía se entra directo; con varias se muestra el selector, con la activa preseleccionada.
 * - El error de credenciales es genérico: no revela si el correo existe.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from '@tanstack/react-router';
import { AlertCircle, ArrowLeft, Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { FormField, Label } from '@/components/ui/form-field';
import { Checkbox, Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { AuthShell, PasswordField, authLinkClass } from './auth-shell';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Ingresá tu correo.')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Revisá el correo. Ejemplo: nombre@empresa.com.py'),
  password: z.string().min(1, 'Ingresá tu contraseña.'),
  remember: z.boolean(),
});
type LoginValues = z.infer<typeof loginSchema>;

/** Contraseña que, en el prototipo, simula credenciales incorrectas. */
export const DEMO_WRONG_PASSWORD = 'incorrecta';

type Role = 'admin' | 'operator' | 'merchant' | 'courier';
const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administración',
  operator: 'Operación',
  merchant: 'Comercio',
  courier: 'Repartidor/a',
};
/** Adónde lleva cada rol al entrar (en el prototipo, al prototipo equivalente). */
const ROLE_HOME: Record<Role, string> = {
  admin: '/panel/prototipo/despacho',
  operator: '/panel/prototipo/despacho',
  merchant: '/panel/ui',
  courier: '/prototipo/repartidor',
};

interface DemoMembership {
  tenantId: string;
  tenantName: string;
  role: Role;
  detail: string;
}
/** Forma prevista de la respuesta del ingreso: `memberships` + `activeTenantId`. */
export const DEMO_SESSION: { memberships: DemoMembership[]; activeTenantId: string } = {
  activeTenantId: 't-envios',
  memberships: [
    {
      tenantId: 't-envios',
      tenantName: 'Envíos Ejemplo S.A.',
      role: 'operator',
      detail: 'Última vez hoy',
    },
    {
      tenantId: 't-flota',
      tenantName: 'Flota Prueba',
      role: 'admin',
      detail: 'Última vez hace 3 días',
    },
    {
      tenantId: 't-rapido',
      tenantName: 'Rápido Demo',
      role: 'courier',
      detail: 'Última vez el 2 de noviembre',
    },
  ],
};

function CompanyPicker({ email, onBack }: { email: string; onBack: () => void }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(DEMO_SESSION.activeTenantId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const chosen = DEMO_SESSION.memberships.find((m) => m.tenantId === selected)!;

  return (
    <AuthShell
      banner="Empresas de ejemplo. Elegir una te lleva al prototipo de esa función."
      title={
        <span ref={headingRef} tabIndex={-1} className="outline-none">
          ¿Con qué empresa trabajás hoy?
        </span>
      }
      lead={
        <>
          Entraste como <span className="font-semibold text-foreground">{email}</span>. Podés
          cambiar de empresa después desde el menú de arriba.
        </>
      }
    >
      <form
        className="mt-6 flex flex-col gap-4"
        aria-label="Elegir empresa"
        onSubmit={(e) => {
          e.preventDefault();
          toast({
            tone: 'success',
            title: `Entraste a ${chosen.tenantName}`,
            description: 'Prototipo: se abre la pantalla de tu rol con datos de ejemplo.',
          });
          void navigate({ href: ROLE_HOME[chosen.role] });
        }}
      >
        <fieldset>
          <legend className="sr-only">Empresas</legend>
          <div className="flex flex-col gap-2">
            {DEMO_SESSION.memberships.map((m) => {
              const checked = m.tenantId === selected;
              return (
                <label
                  key={m.tenantId}
                  className={cn(
                    'relative flex min-h-16 cursor-pointer items-center gap-3 rounded-md border bg-card p-3 transition-colors duration-(--dur-fast)',
                    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                    checked
                      ? 'border-foreground shadow-[inset_3px_0_0_var(--brand)]'
                      : 'border-input hover:bg-muted',
                  )}
                >
                  <input
                    type="radio"
                    name="tenant"
                    value={m.tenantId}
                    checked={checked}
                    onChange={() => setSelected(m.tenantId)}
                    className="sr-only"
                  />
                  <Avatar name={m.tenantName} size="md" className="rounded-sm" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{m.tenantName}</span>
                    <span className="text-[0.8125rem] text-muted-foreground">
                      {ROLE_LABEL[m.role]} · {m.detail}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full border',
                      checked ? 'border-foreground bg-foreground text-background' : 'border-input',
                    )}
                  >
                    {checked ? <Check className="size-4" /> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <Button type="submit" size="lg" className="w-full">
          Entrar a {chosen.tenantName}
        </Button>
        <button type="button" onClick={onBack} className={cn(authLinkClass, 'self-start gap-1.5')}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          Usar otra cuenta
        </button>
      </form>
    </AuthShell>
  );
}

export function LoginPrototype() {
  const [step, setStep] = useState<{ kind: 'form' } | { kind: 'empresa'; email: string }>({
    kind: 'form',
  });
  const [authError, setAuthError] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember: true },
  });

  useEffect(() => {
    if (authError) alertRef.current?.focus();
  }, [authError]);

  if (step.kind === 'empresa') {
    return (
      <CompanyPicker
        email={step.email}
        onBack={() => {
          setStep({ kind: 'form' });
          setTimeout(() => setFocus('email'), 0);
        }}
      />
    );
  }

  return (
    <AuthShell
      banner={
        <>
          Solo visual, no se envía nada. Probá la contraseña “{DEMO_WRONG_PASSWORD}” para ver el
          error.
        </>
      }
      title="Ingresá al panel"
      lead="Con el correo de tu empresa."
    >
      {authError ? (
        <div
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          className="mt-6 flex gap-2.5 rounded-md border border-tone-red-solid/40 bg-tone-red-bg p-3 text-sm text-tone-red-fg outline-none focus-visible:outline-2 focus-visible:outline-ring"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            <span className="font-semibold">El correo o la contraseña no coinciden.</span> Revisalos
            o pedí un enlace para crear una contraseña nueva.
          </p>
        </div>
      ) : null}

      <form
        noValidate
        aria-label="Ingreso"
        className="mt-6 flex flex-col gap-4"
        onSubmit={handleSubmit(async (values) => {
          setAuthError(false);
          // Simula la ida y vuelta al servidor para mostrar el estado de carga.
          await new Promise((r) => setTimeout(r, 450));
          if (values.password === DEMO_WRONG_PASSWORD) {
            setAuthError(true);
            return;
          }
          setStep({ kind: 'empresa', email: values.email });
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
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <Checkbox id="login-remember" className="size-5" {...register('remember')} />
            <Label htmlFor="login-remember" className="text-sm font-normal">
              Recordarme en este equipo
            </Label>
          </div>
          <Link to="/prototipo/olvide-contrasena" className={authLinkClass}>
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
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
          En equipos compartidos, desmarcá “Recordarme” y cerrá la sesión al terminar.
        </p>
      </form>
    </AuthShell>
  );
}
