/*
 * Aceptar una invitación (`/invitacion#token=…`, #18).
 *
 * El token llega en el fragmento (no viaja al servidor web ni queda en logs de acceso) y se saca
 * de la barra de direcciones apenas se lee, como en el reset de contraseña. La pantalla pide al
 * servidor qué invitación es (empresa, rol, si ya hay cuenta) y:
 *  - con cuenta: un botón, y después a ingresar como siempre;
 *  - sin cuenta: nombre y contraseña, y después a ingresar.
 * No inicia sesión sola.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useRouter } from '@tanstack/react-router';
import {
  type InvitationPreview,
  PASSWORD_MAX_LENGTH,
  invitationTokenSchema,
} from '@zestia/contracts';
import { CircleCheck, Link2Off } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button, buttonVariants } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { MIN_PASSWORD, tokenFromHash } from '@/features/auth/auth-api';
import { AuthShell, PasswordField, Requirement, authLinkClass } from '@/features/auth/auth-shell';
import { FormAlert } from '@/features/auth/form-alert';
import { ApiError, describeApiError } from '@/lib/api';
import { ROLE_LABEL, SESSION_KEY } from '@/lib/session';
import { cn } from '@/lib/utils';
import { invitationAcceptanceApi } from './members-api';

const newAccountSchema = z
  .object({
    name: z.string().trim().min(1, 'Ingresá tu nombre.').max(120, 'Usá como mucho 120 caracteres.'),
    password: z
      .string()
      .min(1, 'Elegí una contraseña.')
      .min(MIN_PASSWORD, `Usá al menos ${MIN_PASSWORD} caracteres.`)
      .max(PASSWORD_MAX_LENGTH, `Usá como mucho ${PASSWORD_MAX_LENGTH} caracteres.`),
    confirm: z.string().min(1, 'Repetí la contraseña.'),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Las contraseñas no coinciden.',
  });
type NewAccountValues = z.infer<typeof newAccountSchema>;

function InvalidInvitation() {
  return (
    <AuthShell title="Esta invitación ya no sirve">
      <div className="mt-4 flex gap-2.5 text-base text-muted-foreground">
        <Link2Off aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <p>Venció, ya se usó o la revocaron. Pedile a quien te invitó que te mande una nueva.</p>
      </div>
      <Link to="/ingreso" className={cn(authLinkClass, 'mt-6 self-start')}>
        Ir al ingreso
      </Link>
    </AuthShell>
  );
}

function Done({ tenantName, accountCreated }: { tenantName: string; accountCreated: boolean }) {
  const headingRef = useRef<HTMLSpanElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <AuthShell
      title={
        <span ref={headingRef} tabIndex={-1} className="outline-none">
          Listo, ya sos parte de {tenantName}
        </span>
      }
    >
      <p className="mt-4 flex gap-2.5 text-base text-muted-foreground">
        <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-tone-green-solid" />
        {accountCreated
          ? 'Creamos tu cuenta. Ingresá con tu correo y la contraseña que acabás de elegir.'
          : 'Ingresá con tu correo y tu contraseña de siempre. Vas a ver la empresa nueva en el selector.'}
      </p>
      <Link to="/ingreso" className={cn(buttonVariants({ size: 'lg' }), 'mt-6 w-full')}>
        Ir al ingreso
      </Link>
    </AuthShell>
  );
}

function Intro({ invitation }: { invitation: InvitationPreview }) {
  return (
    <p className="mt-2 text-base text-muted-foreground">
      Te sumás con el rol{' '}
      <span className="font-semibold text-foreground">{ROLE_LABEL[invitation.role]}</span> y tu
      correo <span className="font-semibold text-foreground">{invitation.email}</span>.
    </p>
  );
}

function ExistingAccount({
  invitation,
  error,
  onAccept,
}: {
  invitation: InvitationPreview;
  error: string | null;
  onAccept: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell title={`Te invitaron a ${invitation.tenantName}`}>
      <Intro invitation={invitation} />
      {error ? <FormAlert>{error}</FormAlert> : null}
      <p className="mt-2 text-sm text-muted-foreground">
        Ya tenés una cuenta con ese correo: no hace falta crear otra.
      </p>
      <Button
        size="lg"
        className="mt-6 w-full"
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={async () => {
          setBusy(true);
          try {
            await onAccept();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Aceptando…' : 'Aceptar la invitación'}
      </Button>
    </AuthShell>
  );
}

function NewAccount({
  invitation,
  error,
  onAccept,
}: {
  invitation: InvitationPreview;
  error: string | null;
  onAccept: (values: { name: string; password: string }) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<NewAccountValues>({
    resolver: zodResolver(newAccountSchema),
    defaultValues: { name: '', password: '', confirm: '' },
  });
  const [password, confirm] = useWatch({ control, name: ['password', 'confirm'] });

  return (
    <AuthShell title={`Te invitaron a ${invitation.tenantName}`}>
      <Intro invitation={invitation} />
      {error ? <FormAlert>{error}</FormAlert> : null}
      <form
        noValidate
        aria-label="Crear tu cuenta"
        className="mt-6 flex flex-col gap-4"
        onSubmit={handleSubmit((values) =>
          onAccept({ name: values.name, password: values.password }),
        )}
      >
        <FormField
          label="Tu nombre"
          required
          help="Así te ven en la empresa."
          error={errors.name?.message}
        >
          <Input autoComplete="name" className="h-11 text-base" {...register('name')} />
        </FormField>
        {/* El gestor de contraseñas asocia la contraseña al correo de la invitación. */}
        <input type="email" hidden readOnly autoComplete="username" value={invitation.email} />
        <PasswordField
          label="Contraseña"
          autoComplete="new-password"
          aria-describedby="invite-reqs"
          error={errors.password?.message}
          {...register('password')}
        />
        <PasswordField
          label="Repetir contraseña"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register('confirm')}
        />
        <ul id="invite-reqs" className="flex flex-col gap-1.5 text-sm">
          <Requirement met={password.length >= MIN_PASSWORD}>
            {`Al menos ${MIN_PASSWORD} caracteres`}
          </Requirement>
          <Requirement met={password.length > 0 && password === confirm}>
            Las dos coinciden
          </Requirement>
        </ul>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isSubmitting}
          aria-busy={isSubmitting || undefined}
        >
          {isSubmitting ? 'Creando tu cuenta…' : 'Crear cuenta y aceptar'}
        </Button>
      </form>
    </AuthShell>
  );
}

export function AcceptInvitationPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hash, pathname } = useLocation();
  const [token, setToken] = useState<string | null>(() => tokenFromHash(hash));
  const [seenHash, setSeenHash] = useState(hash);
  const [done, setDone] = useState<{ accountCreated: boolean } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Un enlace nuevo (otro fragmento) reinicia la pantalla.
  if (hash !== seenHash) {
    setSeenHash(hash);
    const fromHash = tokenFromHash(hash);
    if (fromHash) {
      setToken(fromHash);
      setDone(null);
      setInvalid(false);
    }
  }

  // Ya leído, el token sale de la barra de direcciones (sin sumar historial).
  useEffect(() => {
    if (tokenFromHash(hash)) router.history.replace(pathname);
  }, [hash, pathname, router]);

  const wellFormed = token !== null && invitationTokenSchema.safeParse(token).success;
  const preview = useQuery({
    queryKey: ['invitation-preview', token],
    queryFn: () => invitationAcceptanceApi.preview(token!),
    enabled: wellFormed,
    retry: false,
    staleTime: Infinity,
  });

  if (!wellFormed || invalid) return <InvalidInvitation />;
  if (preview.isPending) {
    return (
      <AuthShell title="Revisando tu invitación…">
        <p role="status" className="mt-4 text-base text-muted-foreground">
          Un momento.
        </p>
      </AuthShell>
    );
  }
  if (preview.isError) {
    if (preview.error instanceof ApiError && preview.error.status === 400)
      return <InvalidInvitation />;
    return (
      <AuthShell title="No pudimos abrir tu invitación">
        <FormAlert>{describeApiError(preview.error)}</FormAlert>
        <Button size="lg" className="mt-6 w-full" onClick={() => void preview.refetch()}>
          Probar de nuevo
        </Button>
      </AuthShell>
    );
  }

  const invitation = preview.data;
  if (done) return <Done tenantName={invitation.tenantName} accountCreated={done.accountCreated} />;

  async function accept(details?: { name: string; password: string }) {
    setError(null);
    try {
      const result = await invitationAcceptanceApi.accept({ token: token!, ...details });
      // Si había una sesión abierta de esta cuenta, sus empresas cambiaron.
      await queryClient.invalidateQueries({ queryKey: SESSION_KEY });
      setDone({ accountCreated: result.accountCreated });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : null;
      if (code === 'INVITATION_INVALID') setInvalid(true);
      else if (code === 'ALREADY_MEMBER') setDone({ accountCreated: false });
      else if (code === 'ACCOUNT_DETAILS_REQUIRED') {
        // Alguien borró la cuenta en el medio (raro): volver a preguntar.
        await preview.refetch();
      } else setError(describeApiError(e));
    }
  }

  return invitation.accountExists ? (
    <ExistingAccount invitation={invitation} error={error} onAccept={() => accept()} />
  ) : (
    <NewAccount invitation={invitation} error={error} onAccept={accept} />
  );
}
