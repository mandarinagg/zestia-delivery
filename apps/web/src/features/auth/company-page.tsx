import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import {
  ROLE_LABEL,
  homeFor,
  selectableMemberships,
  storeSession,
  type Session,
} from '@/lib/session';
import { cn } from '@/lib/utils';
import { AuthShell, authLinkClass } from './auth-shell';
import { authApi, describeAuthError, safeRedirect } from './auth-api';
import { FormAlert } from './form-alert';

/**
 * Selector de empresa (`POST /auth/switch-tenant`). Se llega acá cuando el usuario tiene varias
 * empresas y todavía no eligió, o cuando la elegida dejó de estar disponible. Las empresas
 * suspendidas se muestran pero no se pueden elegir.
 */
export function CompanyPage({ session, redirect }: { session: Session; redirect?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const options = selectableMemberships(session);
  const suspended = session.memberships.filter((m) => m.tenantStatus !== 'ACTIVE');
  const [selected, setSelected] = useState(
    options.find((m) => m.tenantId === session.activeTenantId)?.tenantId ?? options[0]?.tenantId,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLSpanElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const chosen = options.find((m) => m.tenantId === selected);

  async function switchAccount() {
    try {
      await authApi.logout();
    } finally {
      storeSession(queryClient, null);
      await navigate({ to: '/ingreso' });
    }
  }

  const title = (
    <span ref={headingRef} tabIndex={-1} className="outline-none">
      {options.length > 0 ? '¿Con qué empresa trabajás hoy?' : 'No tenés empresas disponibles'}
    </span>
  );

  if (!chosen) {
    return (
      <AuthShell title={title}>
        <p className="mt-4 text-base text-muted-foreground">
          Tu cuenta ({session.user.email}) no tiene acceso a ninguna empresa activa. Pedile a quien
          administra tu empresa que revise tu acceso.
        </p>
        <button
          type="button"
          onClick={() => void switchAccount()}
          className={cn(authLinkClass, 'mt-6 gap-1.5 self-start')}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Usar otra cuenta
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={title}
      lead={
        <>
          Entraste como <span className="font-semibold text-foreground">{session.user.email}</span>.
          Podés cambiar de empresa después desde el menú de arriba.
        </>
      }
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <form
        className="mt-6 flex flex-col gap-4"
        aria-label="Elegir empresa"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setBusy(true);
          try {
            const next = await authApi.switchTenant(chosen.tenantId);
            storeSession(queryClient, next);
            await navigate({ href: safeRedirect(redirect) ?? homeFor(chosen.role) });
          } catch (err) {
            setError(
              err instanceof ApiError && err.code === 'NO_ACTIVE_MEMBERSHIP'
                ? 'Ya no tenés acceso a esa empresa. Elegí otra o pedí que revisen tu acceso.'
                : describeAuthError(err),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset>
          <legend className="sr-only">Empresas</legend>
          <div className="flex flex-col gap-2">
            {options.map((m) => {
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
                      {ROLE_LABEL[m.role]}
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
        {suspended.length > 0 ? (
          <div className="text-[0.8125rem] text-muted-foreground">
            <p className="font-semibold">No disponibles por ahora</p>
            <ul className="mt-1 list-disc pl-5">
              {suspended.map((m) => (
                <li key={m.tenantId}>{m.tenantName} (suspendida)</li>
              ))}
            </ul>
          </div>
        ) : null}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={busy}
          aria-busy={busy || undefined}
        >
          {busy ? 'Entrando…' : `Entrar a ${chosen.tenantName}`}
        </Button>
        <button
          type="button"
          onClick={() => void switchAccount()}
          className={cn(authLinkClass, 'self-start gap-1.5')}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Usar otra cuenta
        </button>
      </form>
    </AuthShell>
  );
}
