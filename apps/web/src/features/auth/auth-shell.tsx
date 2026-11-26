/*
 * Marco común de las pantallas de cuenta (ingreso, empresa, recuperar y restablecer
 * contraseña). Panel de marca a la izquierda desde `lg`; en móvil, una franja de tinta arriba.
 * El panel de marca es decorativo (`aria-hidden`): los pedidos que muestra no son datos.
 */
import { Check, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { LogoMark, Wordmark } from '@/components/brand/logo';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { OrderRail } from '@/components/ui/order-rail';
import { OrderStatusPill } from '@/components/ui/status-pill';
import type { OrderStatus } from '@/lib/order-states';
import { cn } from '@/lib/utils';

/** Motivo de la marca: pedidos de ejemplo avanzando por el riel, como un tablero de salidas. */
const BOARD: [string, OrderStatus][] = [
  ['DEMO-1061', 'PENDIENTE_ASIGNACION'],
  ['DEMO-1053', 'ASIGNADO'],
  ['DEMO-1048', 'EN_RETIRO'],
  ['DEMO-1043', 'EN_CAMINO'],
  ['DEMO-1040', 'ENTREGADO'],
];

function BrandPanel() {
  return (
    // `dark` re-aplica los tokens oscuros dentro del panel: el riel y los tonos se leen sobre tinta.
    <aside className="dark relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
      <div className="flex items-center gap-2.5">
        <LogoMark className="size-9" />
        <Wordmark className="text-xl" />
      </div>
      <div aria-hidden="true" className="flex max-w-md flex-col gap-4">
        {BOARD.map(([id, status], i) => (
          <div
            key={id}
            className="grid grid-cols-[6rem_1fr_7rem] items-center gap-4"
            style={{ opacity: 1 - i * 0.12 }}
          >
            <span className="font-numeric text-base font-semibold text-sidebar-muted">{id}</span>
            <OrderRail status={status} size="md" />
            <OrderStatusPill status={status} short className="justify-self-start" />
          </div>
        ))}
      </div>
      <p className="max-w-md text-balance font-display text-[2.25rem] font-semibold leading-10">
        Cada pedido, de la tienda a la puerta.
      </p>
    </aside>
  );
}

export function AuthShell({
  banner,
  title,
  lead,
  children,
}: {
  /** Aviso arriba del título (p. ej. el rótulo de prototipo). */
  banner?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <BrandPanel />
      <div className="flex min-w-0 flex-col">
        <header className="dark flex h-14 items-center gap-2.5 bg-sidebar px-4 text-sidebar-foreground lg:hidden">
          <LogoMark />
          <Wordmark />
        </header>
        <main
          id="contenido"
          className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-8"
        >
          {banner}
          <h1
            className={cn(
              'font-display text-[2rem] font-semibold leading-9 text-balance',
              banner ? 'mt-8' : null,
            )}
          >
            {title}
          </h1>
          {lead ? <p className="mt-1 text-base text-muted-foreground">{lead}</p> : null}
          {children}
        </main>
      </div>
    </div>
  );
}

/** Campo de contraseña con botón para mostrarla (44 px, `aria-pressed`). */
export function PasswordField({
  label,
  error,
  help,
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  help?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <FormField label={label} required error={error} help={help}>
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn('h-11 pr-12 text-base', className)}
          {...props}
        />
      </FormField>
      <button
        type="button"
        aria-label={`Mostrar ${label.toLowerCase()}`}
        aria-pressed={visible}
        className="absolute right-0 top-[1.1875rem] grid size-11 place-items-center rounded-r-sm text-muted-foreground hover:text-foreground [&_svg]:size-5"
        onClick={() => setVisible((s) => !s)}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
  );
}

/** Enlace de texto de las pantallas de cuenta: subrayado y con área táctil de 44 px. */
export const authLinkClass =
  'inline-flex min-h-11 items-center rounded-xs text-sm font-semibold underline decoration-input underline-offset-4 hover:decoration-foreground';

/** Requisito de la contraseña nueva, con estado leído por lectores de pantalla. */
export function Requirement({ met, children }: { met: boolean; children: string }) {
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
